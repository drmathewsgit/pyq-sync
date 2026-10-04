import {synchronize,SHEET_ID} from './qbank-core.mjs';
import {makeScopedAdapter} from './qbank-adapter.ts';
import {fetchStudentSnapshot,studentStoragePrefix,studentLecturePositions,QBANK_NAME} from './qbank-connection.mjs';
import {ensureQbankRoot} from './qbank-setup.mjs';

export const initialPanel={busy:false,message:'Ready to get the latest questions and answers.',error:'',result:null};
async function readWithTimeout(promise,message,ms){
 let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),ms)})]);}finally{clearTimeout(timer);}
}
// Run from the visible panel: a click cannot depend on a background broadcast listener.
export async function runQbankSync(plugin,publish,deps={}){
 const read=deps.fetchSnapshot||fetchStudentSnapshot,run=deps.synchronize||synchronize,make=deps.makeAdapter||makeScopedAdapter,rootFor=deps.ensureRoot||ensureQbankRoot;
 let panel={...initialPanel,busy:true,message:'Connecting to RemNote…'};
 const update=(changes)=>{panel={...panel,...changes};publish(panel);};
 publish(panel);
 try{
  await readWithTimeout(plugin.app.waitForInitialSync(),'RemNote is still loading. Wait for its account sync to finish, then retry.',deps.timeoutMs||30000);
  const kb=await readWithTimeout(plugin.kb.getCurrentKnowledgeBaseData(),'RemNote did not identify the open knowledge base. Reopen the plugin and retry.',deps.timeoutMs||15000);
  if(!kb?._id)throw new Error('Open a RemNote knowledge base before syncing.');
  const checkKnowledgeBase=async()=>{if((await plugin.kb.getCurrentKnowledgeBaseData())?._id!==kb._id)throw new Error('The knowledge base changed during sync. Open the original knowledge base and retry.');};
  const execute=async()=>{
   update({message:'Reading the master Google Sheet…'});
   const source=await read(true);await checkKnowledgeBase();
   update({message:'Preparing your AnaBodhi folder…'});
   const root=await rootFor(plugin,kb._id);
   const prefix=studentStoragePrefix(kb._id,root._id);
   const adapter=make(plugin,{rootId:root._id,rootName:QBANK_NAME,storagePrefix:prefix,sourceAuthoritative:true,mirrorExtras:true,lecturePositions:studentLecturePositions(source.lectures),beforeWrite:checkKnowledgeBase});
   update({message:'Updating question cards…'});
   const result=await run(source,adapter,p=>update({message:`${p.message} (${p.done}/${p.total})`}),()=>read(true));
   await checkKnowledgeBase();
   const saved={...result,bindings:undefined,time:new Date().toLocaleString()};
   try{await plugin.storage.setLocal(prefix+'last-sync',saved);}catch{saved.warnings=[...saved.warnings,'The cards were synced, but this device could not save the last-sync summary.'];}
   update({busy:false,error:'',result:saved,message:saved.conflicts.length||saved.warnings.length?'Sync finished. Some items need attention.':saved.created+saved.updated+saved.trashed?'Sync complete. Your question bank has been updated.':source.rows.some(r=>r.ready)?'Your question bank is up to date.':'No new cards are ready. Complete the answers in Google Sheets.'});
  };
  const locks=Object.hasOwn(deps,'lockManager')?deps.lockManager:globalThis.navigator?.locks;
  if(locks){
   let entered=false;
   try{await locks.request('anabodhi-sync:'+SHEET_ID+':'+kb._id,{ifAvailable:true},async lock=>{entered=true;if(!lock)throw new Error('Another AnaBodhi sync is running. Wait for it to finish.');await execute();});}
   catch(e){if(!entered&&e.name==='SecurityError')await execute();else throw e;}
  }else await execute();
 }catch(e){update({busy:false,error:e.message||String(e),message:'Sync stopped. Completed changes are kept; retry to continue.'});}
 return panel;
}
