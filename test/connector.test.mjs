import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source=readFileSync(new URL('../connector/Code.gs',import.meta.url),'utf8');
function connector(book){
  let opens=0, releases=0;
  const context={
    ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({text:s,setMimeType(){return this}})},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,s)=>Array.from(createHash('sha256').update(s).digest())},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>releases++})},
    SpreadsheetApp:{openById:()=>{opens++;return book}},
  };
  vm.createContext(context);vm.runInContext(source,context);
  return {context,get opens(){return opens},get releases(){return releases},post:req=>JSON.parse(context.doPost({postData:{contents:JSON.stringify(req)}}).text)};
}
test('unauthenticated connector requests cannot open the private sheet',()=>{
  const c=connector();assert.equal(c.post({action:'snapshot',token:'wrong'}).error,'Unauthorized');assert.equal(c.opens,0);
  assert.equal(c.post({action:'ack',bindings:[]}).error,'Unauthorized');assert.equal(c.opens,0);
});
test('pending rows retain their questions and never get tracking metadata',()=>{
  let writes=0;
  const regions=['GE','UL','LL','AB','PP','T','HN','NA','EG','H','AC'];
  const tabs=Object.fromEntries(regions.map(region=>[region,{
    getLastRow:()=>2,
    getRange:()=>({getValues:()=>[['Lecture Code','No.','Question','Answers','','','','Remnotes'],[region+'-1',1,'Name the structure.','#ERROR!','','','','']],addDeveloperMetadata:()=>writes++}),
    createDeveloperMetadataFinder:()=>({withKey(){return this},find:()=>[]})
  }]));
  const index={getLastRow:()=>12,getRange:()=>({getValues:()=>regions.map((r,n)=>[r+'-1','Lecture '+r,1,n+1])})};
  const book={getSheetByName:name=>name==='L load'?index:tabs[name]};
  const c=connector(book),s=c.context.snapshot_(book);
  assert.equal(s.rows.length,11);assert.equal(s.rows.every(r=>r.question==='Name the structure.'&&!r.ready&&r.answer===''&&r.sourceId===null),true);assert.equal(writes,0);
});
test('a changed RemNote link prevents the entire acknowledgement write batch',()=>{
  let writes=0;
  const cell=old=>({getValue:()=>old,setValue:()=>writes++});
  const meta=(id,old)=>({getId:()=>id,getLocation:()=>({getRow:()=>({getRow:()=>id+1,getSheet:()=>({getName:()=> 'UL',getRange:()=>cell(old)})})})});
  const book={createDeveloperMetadataFinder:()=>({withKey(){return this},find:()=>[meta(1,''),meta(2,'different-existing-link')]})};
  const c=connector(book);
  assert.throws(()=>c.context.ack_(book,[{sourceId:'g1',remId:'card1'},{sourceId:'g2',remId:'card2'}]),/preserved/);
  assert.equal(writes,0);
});
test('ready questions use entire-row metadata and retain stable identities on repeat',()=>{
  const meta=[];let created=0;
  const rows=[['Lecture Code','No.','Question','Answers','','','','Remnotes'],['UL-1',1,'Name the bone.','1. Clavicle','','','','']];
  const tab={getLastRow:()=>2,getRange:(...args)=>{
    if(typeof args[0]==='number')return {getValues:()=>rows,addDeveloperMetadata:()=>{throw new Error('Arbitrary range is not an entire row')}};
    assert.equal(args[0],'2:2');return {addDeveloperMetadata:()=>{created++;meta.push({getId:()=>91,getKey:()=> 'pyq_sync',getLocation:()=>({getRow:()=>({getRow:()=>2})})})},getDeveloperMetadata:()=>meta};
  },createDeveloperMetadataFinder:()=>({withKey(){return this},find:()=>meta})};
  const empty={getLastRow:()=>1,getRange:()=>({getValues:()=>[rows[0]]}),createDeveloperMetadataFinder:()=>({withKey(){return this},find:()=>[]})};
  const index={getLastRow:()=>2,getRange:()=>({getValues:()=>[['UL-1','Upper limb',1,1]]})};
  const book={getSheetByName:name=>name==='L load'?index:name==='UL'?tab:empty};
  const c=connector(book);c.context.SpreadsheetApp.DeveloperMetadataVisibility={DOCUMENT:'DOCUMENT'};
  assert.equal(c.context.snapshot_(book).rows[0].sourceId,'g91');assert.equal(c.context.snapshot_(book).rows[0].sourceId,'g91');assert.equal(created,1);
});
