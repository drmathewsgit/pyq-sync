import React,{useRef,useState} from 'react';
import {declareIndexPlugin,renderWidget,usePlugin,WidgetLocation} from '@remnote/plugin-sdk';
import {SHEET_ID} from './qbank-core.mjs';
import {QBANK_NAME} from './qbank-connection.mjs';
import {runQbankSync,initialPanel} from './qbank-runner.mjs';
import {registerQbank} from './qbank-setup.mjs';
import './qbank-base.css';
import './qbank-style.css';
declare const __PYQ_WIDGET__:string;
function Panel(){
 const plugin=usePlugin(),[state,setState]=useState<any>(initialPanel),running=useRef(false);
 const {busy,message,result}=state;
 async function sync(){
  if(running.current)return;
  running.current=true;
  try{await runQbankSync(plugin,setState);}finally{running.current=false;}
 }
 return <main><div className="eyebrow">GOOGLE SHEETS → REMNOTE</div><h1>AnaBodhi <small>1.0</small></h1><p className="lead">One shared Anatomy question bank for teachers and students.</p><div className="source"><span>Master</span><strong>PYQ Google Sheet · 11 anatomy tabs</strong><span>Destination</span><strong>Region → Lecture → Question cards</strong></div><p className="foot">Your lecture documents are created automatically on first sync.</p><button className="sync" disabled={busy} onClick={sync}>{busy?'Syncing…':'Sync'}</button><p role="status" className="status">{message}</p>{state.error&&<p role="alert" className="error">{state.error}</p>}{result&&<section className="result"><p className="counts">Created: {result.created}<br/>Updated: {result.updated}<br/>Unchanged: {result.unchanged}<br/>Trashed: {result.trashed}<br/>Waiting for answers or a valid lecture: {result.skipped.toLocaleString()}</p>{result.conflicts.length>0&&<details open><summary>{result.conflicts.length} cards need attention</summary><ul>{result.conflicts.map((c:string,i:number)=><li key={i}>{c}</li>)}</ul></details>}{result.warnings.length>0&&<details open><summary>Sync notices</summary><ul>{result.warnings.map((w:string,i:number)=><li key={i}>{w}</li>)}</ul></details>}<small>Last sync: {result.time}</small></section>}<a href={`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`} target="_blank" rel="noreferrer">Open the master Google Sheet ↗</a><p className="foot">Google Sheets controls the synced questions, answers and lecture placement. Changes made directly to a synced card are replaced on the next sync. Deleted sheet questions and extra cards added inside this collection move to Trash. Create new questions in Google Sheets. Pending answers keep the last completed version. Trashed cards still present in the sheet are recreated. Review history stays with updated cards; recreated cards start fresh.</p><p className="foot">Use Sync on one device at a time. Keep this Sync panel open until it finishes, and allow your RemNote account to finish syncing before switching devices.</p></main>;
}
if(__PYQ_WIDGET__==='index'){
 declareIndexPlugin(async plugin=>{
  // Numeric dimensions avoid a feedback loop between the iframe's auto height
  // and a scroll container measured against that same iframe viewport.
  await plugin.app.registerWidget('qbank_popup',WidgetLocation.Popup,{dimensions:{height:560,width:440}});
  await plugin.app.registerSidebarButton({id:'open-qbank',name:QBANK_NAME,icon:'sync',action:()=>plugin.widget.openPopup('qbank_popup',undefined,false)});
  await plugin.app.registerCommand({id:'open-qbank',name:'Open AnaBodhi',action:()=>plugin.widget.openPopup('qbank_popup',undefined,false)});
  // A setup failure must not prevent opening the panel. Sync retries setup
  // and displays any permission error directly to the user.
  try{await registerQbank(plugin);}catch{}
 },async()=>{});
}else renderWidget(Panel);
