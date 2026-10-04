import React,{useState,useEffect} from 'react';
import {declareIndexPlugin,renderWidget,usePlugin,WidgetLocation} from '@remnote/plugin-sdk';
import {synchronize,SHEET_ID} from './core.mjs';
import {makeAdapter} from './adapter';
import './style.css';
const diagnostic=(stage:string)=>fetch('http://localhost:27182/api/diagnostic',{method:'POST',headers:{'Content-Type':'application/json','X-PYQ-Sync':'1'},body:JSON.stringify({stage})}).catch(()=>{});
window.addEventListener('error',e=>diagnostic('error: '+e.message));
window.addEventListener('unhandledrejection',e=>diagnostic('rejection: '+String(e.reason?.message||e.reason)));

async function bridge(action:string,data:any={}){
  const response=await fetch('/api/sync',{method:'POST',headers:{'Content-Type':'application/json','X-PYQ-Sync':'1'},body:JSON.stringify({action,...data})});
  const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'The sheet connection is unavailable.');return result;
}
function Panel(){
  const plugin=usePlugin();const [busy,setBusy]=useState(false);const [message,setMessage]=useState('Ready to check the PYQ sheet.');const [result,setResult]=useState<any>(null);const [error,setError]=useState('');
  useEffect(()=>{plugin.storage.getLocal<any>('pyq-last-sync').then(v=>{if(v)setResult(v)});},[]);
  async function sync(){
    setBusy(true);setError('');setMessage('Reading the latest questions and answers…');
    let lock:string|undefined;
    try{
      const claim=await bridge('begin');lock=claim.lock;
      const source=await bridge('snapshot',{lock});
      const r=await synchronize(source,makeAdapter(plugin),(p:any)=>setMessage(`${p.message} (${p.done}/${p.total})`));
      if(r.bindings.length)await bridge('ack',{lock,bindings:r.bindings});
      const saved={...r,bindings:undefined,time:new Date().toLocaleString()};setResult(saved);await plugin.storage.setLocal('pyq-last-sync',saved);
      setMessage(r.created+r.updated>0?'Sync complete.':r.skipped===source.rows.length?'Waiting for answers to be generated in Google Sheets.':'Your cards are up to date.');
    }catch(e:any){setError(e.message||String(e));setMessage('Sync stopped. Existing cards have been kept.');}
    finally{if(lock)await bridge('end',{lock}).catch(()=>{});setBusy(false);}
  }
  return <main><div className="eyebrow">GOOGLE SHEETS → REMNOTE</div><h1>PYQ Sync</h1><p className="lead">Bring your latest lecture questions and answers into Anatomy PYQ.</p><div className="source"><span>Source</span><strong>PYQ · 11 anatomy tabs</strong><span>Destination</span><strong>Anatomy PYQ</strong></div><button className="sync" disabled={busy} onClick={sync}>{busy?'Syncing…':'Sync PYQ now'}</button><p role="status" className="status">{message}</p>{error&&<p role="alert" className="error">{error}</p>}{result&&<section className="result"><div className="stats"><div><b>{result.created}</b>created</div><div><b>{result.updated}</b>updated</div><div><b>{result.unchanged}</b>unchanged</div></div><p>{result.skipped.toLocaleString()} questions waiting for usable answers.</p>{result.conflicts.length>0&&<details><summary>{result.conflicts.length} conflicts need review</summary><ul>{result.conflicts.map((c:string)=><li key={c}>{c}</li>)}</ul></details>}<small>Last check: {result.time}</small></section>}<a href={`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`} target="_blank" rel="noreferrer">Open PYQ sheet ↗</a><p className="foot">Updates existing cards. Keeps lecture order and numbered answers. Removed questions and conflicting edits are kept for review.</p></main>;
}
declare const __PYQ_WIDGET__: string;
if(__PYQ_WIDGET__==='index'){
  declareIndexPlugin(async plugin=>{
    await diagnostic('index activated');
    await plugin.app.registerWidget('pyq_popup',WidgetLocation.Popup,{dimensions:{height:650,width:440}});
    await plugin.app.registerSidebarButton({id:'open-pyq-sync',name:'PYQ Sync',icon:'sync',action:()=>plugin.widget.openPopup('pyq_popup')});
    await plugin.app.registerCommand({id:'sync-pyq',name:'Open PYQ Sync',action:()=>plugin.widget.openPopup('pyq_popup')});
    await diagnostic('registration complete');
  },async()=>{});
}else{renderWidget(Panel);}
