import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {studentSnapshot,fetchStudentSnapshot,studentStoragePrefix,studentLecturePositions,QBANK_NAME} from './qbank-connection.mjs';
import {synchronize,SHEET_ID,REGIONS} from './qbank-core.mjs';
const compiled=await build({entryPoints:[new URL('./qbank-adapter.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node'});
const {makeScopedAdapter}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const sample=()=>({ok:true,audience:'pyq-students-v1',spreadsheetId:SHEET_ID,lectures:[{code:'GE-1',title:'Anatomical position (AN 1.1)',sequence:1}],rows:[{sourceId:'g1',region:'GE',lecture:'GE-1',order:1,question:'Name the position.',answer:'1. Anatomical position',ready:true,remId:'TEACHER_CARD_ID'}],tracking:{version:1,complete:true,regions:REGIONS,sourceIds:['g1']}});
function sdk(rootId,sharedStorage){
 const rems=new Map(),trash=new Map();let seq=0;
 function rem(id,text=[]){const r={_id:id,text,backText:[],children:[],parent:null,async setText(t){this.text=t},async setBackText(t){this.backText=t},async setIsDocument(){},async isDocument(){return false},async setParent(parent,pos){if(this.parent){const old=rems.get(this.parent);old.children=old.children.filter(x=>x!==id)}this.parent=parent;const p=rems.get(parent);if(!p)throw new Error('Outside knowledge base');p.children.splice(pos??p.children.length,0,id)},async remove(){trash.set(id,this);rems.delete(id);const p=rems.get(this.parent);if(p)p.children=p.children.filter(x=>x!==id)}};rems.set(id,r);return r;}
 rem(rootId,[QBANK_NAME]);
 const plugin={rem:{findOne:async id=>rems.get(id),createRem:async()=>rem(rootId+'-'+(++seq)),findByName:async(t,p)=>[...rems.values()].find(r=>r.parent===p&&r.text.join('')===t.join(''))},storage:{getSynced:async k=>sharedStorage.get(k),setSynced:async(k,v)=>sharedStorage.set(k,v)},richText:{toString:async t=>t.join(''),text:first=>{const parts=[first];const b={text:t=>(parts.push(t),b),newline:()=>(parts.push('\n'),b),value:()=>parts};return b}}};return {plugin,rems,trash};
}
const adapter=(s,kb,root)=>makeScopedAdapter(s.plugin,{rootId:root,rootName:QBANK_NAME,storagePrefix:studentStoragePrefix(kb,root),protectUntracked:true});
test('student content excludes remote teacher card identities and uses GET without credentials',async()=>{
 let request;const s=await fetchStudentSnapshot(true,async(url,opts)=>{request={url,opts};return {ok:true,json:async()=>sample()}});
 assert.equal(s.rows[0].remId,null);assert.equal(request.opts.method,'GET');assert.equal(request.opts.credentials,'omit');assert.ok(request.url.endsWith('action=student&fresh=1'));assert.equal(request.opts.body,undefined);
 assert.throws(()=>studentSnapshot({...sample(),audience:undefined}),/not available/);
 assert.throws(()=>studentSnapshot({...sample(),tracking:undefined}),/tracking/);
});
test('two students and two knowledge bases sync identical source content with independent card identities',async()=>{
 const storage=new Map(),a=sdk('rootA',storage),b=sdk('rootB',storage),s=studentSnapshot(sample());
 const x=await synchronize(s,adapter(a,'kbA','rootA')),y=await synchronize(s,adapter(b,'kbB','rootB'));
 assert.equal(x.created,1);assert.equal(y.created,1);assert.notEqual(x.bindings[0].remId,y.bindings[0].remId);
 assert.equal((await synchronize(studentSnapshot(sample()),adapter(a,'kbA','rootA'))).unchanged,1);
 assert.equal((await synchronize(studentSnapshot(sample()),adapter(b,'kbB','rootB'))).unchanged,1);
 assert.equal(a.rems.size,4);assert.equal(b.rems.size,4);
 const next=sample();next.rows[0].answer='1. Updated teacher answer';
 assert.equal((await synchronize(studentSnapshot(next),adapter(a,'kbA','rootA'))).updated,1);
 assert.equal((await synchronize(studentSnapshot(next),adapter(b,'kbB','rootB'))).updated,1);
 assert.equal(a.rems.get(x.bindings[0].remId).backText.join(''),'1. Updated teacher answer');
});
test('student additions, blank answers, teacher deletions and repeat deletes keep identities stable',async()=>{
 const a=sdk('rootA',new Map()),s=sample();const first=await synchronize(studentSnapshot(s),adapter(a,'kbA','rootA')),id=first.bindings[0].remId;
 s.rows.unshift({...s.rows[0],sourceId:'g2',order:1,question:'Inserted question'});s.rows[1].order=2;s.tracking.sourceIds.push('g2');
 const added=await synchronize(studentSnapshot(s),adapter(a,'kbA','rootA'));assert.equal(added.created,1);assert.equal(added.unchanged,1);
 s.rows[1].answer='';s.rows[1].ready=false;
 await synchronize(studentSnapshot(s),adapter(a,'kbA','rootA'));assert.ok(a.rems.has(id));
 s.rows.pop();s.tracking.sourceIds=['g2'];
 const deleted=await synchronize(studentSnapshot(s),adapter(a,'kbA','rootA'),undefined,async()=>studentSnapshot(s));assert.equal(deleted.trashed,1);assert.ok(a.trash.has(id));
 assert.equal((await synchronize(studentSnapshot(s),adapter(a,'kbA','rootA'),undefined,async()=>studentSnapshot(s))).trashed,0);
});
test('lost student mappings never overwrite a personally edited existing card',async()=>{
 const storage=new Map(),a=sdk('rootA',storage),s=studentSnapshot(sample());
 const first=await synchronize(s,adapter(a,'kbA','rootA')),id=first.bindings[0].remId;a.rems.get(id).backText=['My personal note'];storage.clear();
 const r=await synchronize(studentSnapshot(sample()),adapter(a,'kbA','rootA'));assert.equal(r.created,0);assert.equal(r.updated,0);assert.equal(r.conflicts.length,1);assert.equal(a.rems.get(id).backText.join(''),'My personal note');
});
test('a knowledge-base switch prevents card creation',async()=>{
 const a=sdk('rootA',new Map());const guard=makeScopedAdapter(a.plugin,{rootId:'rootA',rootName:QBANK_NAME,storagePrefix:'student:',beforeWrite:async()=>{throw new Error('knowledge base changed')}});
 await assert.rejects(synchronize(studentSnapshot(sample()),guard),/knowledge base changed/);assert.equal(a.rems.size,1);
});
test('public feed filters test lectures and private card identities while private writes require authorization',()=>{
 let opens=0;const ctx={ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this}})},SpreadsheetApp:{openById(){opens++;throw new Error('should not open')}},Utilities:{DigestAlgorithm:{SHA_256:''},Charset:{UTF_8:''},computeDigest:()=>[]}};vm.createContext(ctx);vm.runInContext(readFileSync(new URL('./qbank-connector.gs',import.meta.url),'utf8'),ctx);
 const s=sample();s.lectures.push({code:'GE-3A',title:'Bone foundations',sequence:2});s.rows.push({...s.rows[0],sourceId:'g2',lecture:'GE-3A',question:'Bone foundation question'});s.lectures.push({code:'GE-T2',title:'Private temporary test',sequence:9999});s.rows.push({...s.rows[0],lecture:'GE-T2',question:'Private temporary test'});s.warnings=[];s.skippedRows=0;
 const result=ctx.studentSnapshot_(s),raw=JSON.stringify(result);assert.ok(!raw.includes('TEACHER_CARD_ID'));assert.ok(!raw.includes('Private temporary test'));assert.equal(result.rows.length,2);assert.ok(result.lectures.some(l=>l.code==='GE-3A'));
 assert.equal(JSON.parse(ctx.doPost({postData:{contents:JSON.stringify({action:'ack',bindings:[{sourceId:'g1',remId:'STUDENT'}]})}}).text).error,'Unauthorized');assert.equal(opens,0);
});

test('split lecture codes retain the teacher’s sequence',()=>{
 assert.deepEqual(studentLecturePositions([{code:'GE-3B',sequence:3},{code:'GE-1',sequence:1},{code:'GE-3A',sequence:2},{code:'UL-1',sequence:4}]),{'GE-1':0,'GE-3A':1,'GE-3B':2,'UL-1':0});
});

test('the master sheet overwrites local question and answer edits on the same card',async()=>{
 const a=sdk('rootA',new Map()),make=()=>makeScopedAdapter(a.plugin,{rootId:'rootA',rootName:QBANK_NAME,storagePrefix:studentStoragePrefix('kbA','rootA'),sourceAuthoritative:true});
 const first=await synchronize(studentSnapshot(sample()),make()),id=first.bindings[0].remId;
 a.rems.get(id).text=['Local question'];a.rems.get(id).backText=['Local answer'];
 const next=sample();next.rows[0].answer='1. Master answer';
 const result=await synchronize(studentSnapshot(next),make());
 assert.equal(result.created,0);assert.equal(result.updated,1);assert.equal(result.conflicts.length,0);assert.equal(result.bindings[0].remId,id);assert.equal(a.rems.get(id).backText.join(''),'1. Master answer');
 const empty=studentSnapshot({...sample(),rows:[],tracking:{version:1,complete:true,regions:REGIONS,sourceIds:[]}});
 a.rems.get(id).backText=['Another local edit'];a.rems.get(id).children.push('local-note');
 const removed=await synchronize(empty,make(),undefined,async()=>empty);assert.equal(removed.trashed,1);assert.ok(a.trash.has(id));
});

test('automatic setup reuses the registered powerup document and protects a changed root',async()=>{
 const {registerQbank,ensureQbankRoot}=await import('./qbank-setup.mjs');
 const a=sdk('auto-root',new Map());let registered;
 a.plugin.app={registerPowerup:async v=>{registered=v}};
 a.plugin.powerup={getPowerupByCode:async code=>{assert.equal(code,'smAnatPyqBank');return a.rems.get('auto-root')}};
 await registerQbank(a.plugin);assert.deepEqual(registered.options,{properties:[]});
 assert.equal((await ensureQbankRoot(a.plugin,'kbA'))._id,'auto-root');assert.equal((await ensureQbankRoot(a.plugin,'kbA'))._id,'auto-root');assert.equal(a.rems.size,1);
 await a.plugin.storage.setSynced('qbank-root-v1:kbA','missing-old-root');await assert.rejects(ensureQbankRoot(a.plugin,'kbA'),/original document/);
});

test('repeated panel requests share one sync and failures allow a retry',async()=>{
 const {singleRunner}=await import('./qbank-setup.mjs');let runs=0,release;
 const run=singleRunner(async()=>{runs++;await new Promise(r=>{release=r});return 7;});
 const first=run(),second=run();assert.equal(first,second);await new Promise(r=>setImmediate(r));assert.equal(runs,1);release();assert.equal(await first,7);
 const again=run();await new Promise(r=>setImmediate(r));release();await again;assert.equal(runs,2);
 let failed=0;const fail=singleRunner(async()=>{if(!failed++)throw new Error('interrupted');return 'recovered';});await assert.rejects(fail(),/interrupted/);assert.equal(await fail(),'recovered');
});
