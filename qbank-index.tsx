import React,{useState} from 'react';
import {declareIndexPlugin,renderWidget,usePlugin,useSessionStorageState,WidgetLocation,AppEvents} from '@remnote/plugin-sdk';
import {synchronize,SHEET_ID} from './qbank-core.mjs';
import {makeScopedAdapter} from './qbank-adapter';
import {fetchStudentSnapshot,studentStoragePrefix,studentLecturePositions,QBANK_NAME} from './qbank-connection.mjs';
import {registerQbank,ensureQbankRoot,singleRunner} from './qbank-setup.mjs';
import './qbank-base.css';
import './qbank-style.css';
declare const __PYQ_WIDGET__:string;
const STATE='qbank-panel-state-v1';
const initial={busy:false,message:'Ready to get the latest questions and answers.',error:'',result:null as any};
function Panel(){
 const plugin=usePlugin(),[state]=useSessionStorageState(STATE,initial),[error,setError]=useState('');
 const {busy,message,result}=state;
 async function request(type:string){try{setError('');await plugin.messaging.broadcast({type});}catch(e:any){setError(e.message||'Reopen the plugin and try again.');}}
 return <main><div className="eyebrow">GOOGLE SHEETS → REMNOTE</div><h1>AnaBodhi <small>1.0</small></h1><p className="lead">One shared Anatomy question bank for teachers and students.</p><div className="source"><span>Master</span><strong>PYQ Google Sheet · 11 anatomy tabs</strong><span>Destination</span><strong>Region → Lecture → Question cards</strong></div><p className="foot">Your lecture documents are created automatically on first sync.</p><button className="sync" disabled={busy} onClick={()=>request('sm-qbank-sync')}>{busy?'Syncing…':'Sync'}</button><p role="status" className="status">{message}</p>{(state.error||error)&&<p role="alert" className="error">{state.error||error}</p>}{result&&<section className="result"><div className="stats"><div><b>{result.created}</b>created</div><div><b>{result.updated}</b>updated</div><div><b>{result.unchanged}</b>unchanged</div><div><b>{result.trashed}</b>trashed</div></div><p>{result.skipped.toLocaleString()} questions are waiting for a completed answer or valid lecture.</p>{result.conflicts.length>0&&<details open><summary>{result.conflicts.length} cards need attention</summary><ul>{result.conflicts.map((c:string,i:number)=><li key={i}>{c}</li>)}</ul></details>}{result.warnings.length>0&&<details open><summary>Sync notices</summary><ul>{result.warnings.map((w:string,i:number)=><li key={i}>{w}</li>)}</ul></details>}<small>Last sync: {result.time}</small></section>}<a href={`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`} target="_blank" rel="noreferrer">Open the master Google Sheet ↗</a><p className="foot">Google Sheets controls the synced questions, answers and lecture placement. Changes made directly to a synced card are replaced on the next sync. Deleted sheet questions and extra cards added inside this collection move to Trash. Create new questions in Google Sheets. Pending answers keep the last completed version. Trashed cards still present in the sheet are recreated. Review history stays with updated cards; recreated cards start fresh.</p><p className="foot">Use Sync on one device at a time. Keep RemNote open until it finishes, and allow your RemNote account to finish syncing before switching devices.</p></main>;
}
if(__PYQ_WIDGET__==='index'){
 declareIndexPlugin(async plugin=>{
  await plugin.app.waitForInitialSync();
  await registerQbank(plugin);
  await plugin.storage.setSession(STATE,initial);
  const run=singleRunner(async()=>{
   let panel={...initial,busy:true,message:'Reading the master Google Sheet…'};
   const publish=async()=>{await plugin.storage.setSession(STATE,panel);};
   try{
    await publish();await plugin.app.waitForInitialSync();
    const kb=await plugin.kb.getCurrentKnowledgeBaseData();
    const checkKnowledgeBase=async()=>{if((await plugin.kb.getCurrentKnowledgeBaseData())._id!==kb._id)throw new Error('The knowledge base changed during sync. Open the original knowledge base and retry.');};
    const source=await fetchStudentSnapshot();
    await checkKnowledgeBase();
    const root=await ensureQbankRoot(plugin,kb._id);
    const prefix=studentStoragePrefix(kb._id,root._id);
    const adapter=makeScopedAdapter(plugin,{rootId:root._id,rootName:QBANK_NAME,storagePrefix:prefix,sourceAuthoritative:true,mirrorExtras:true,lecturePositions:studentLecturePositions(source.lectures),beforeWrite:checkKnowledgeBase});
    let lastProgress=0;
    const result=await synchronize(source,adapter,(p:any)=>{if(Date.now()-lastProgress>600){lastProgress=Date.now();panel={...panel,message:`${p.message} (${p.done}/${p.total})`};void publish().catch(()=>{});}},()=>fetchStudentSnapshot(true));
    await checkKnowledgeBase();
    const saved={...result,bindings:undefined,time:new Date().toLocaleString()};
    await plugin.storage.setLocal(prefix+'last-sync',saved);
    panel={busy:false,error:'',result:saved,message:result.conflicts.length||result.warnings.length?'Sync finished. Some items need attention.':result.created+result.updated+result.trashed?'Sync complete. Your question bank has been updated.':source.rows.some(r=>r.ready)?'Your question bank is up to date.':'No new cards are ready. Complete the answers in Google Sheets.'};
   }catch(e:any){panel={...panel,busy:false,error:e.message||String(e),message:'Sync stopped. Completed changes are kept; retry to continue.'};}
   await publish();
  });
  plugin.event.addListener(AppEvents.MessageBroadcast,undefined,async(message:any)=>{
   if(message?.type==='sm-qbank-sync')await run();

  });
  // Numeric dimensions avoid a feedback loop between the iframe's auto height
  // and a scroll container measured against that same iframe viewport.
  await plugin.app.registerWidget('qbank_popup',WidgetLocation.Popup,{dimensions:{height:560,width:440}});
  await plugin.app.registerSidebarButton({id:'open-qbank',name:QBANK_NAME,icon:'sync',action:()=>plugin.widget.openPopup('qbank_popup')});
  await plugin.app.registerCommand({id:'open-qbank',name:'Open AnaBodhi',action:()=>plugin.widget.openPopup('qbank_popup')});
 },async plugin=>{plugin.event.removeListener(AppEvents.MessageBroadcast,undefined);});
}else renderWidget(Panel);
