import React,{useState,useEffect} from 'react';
import {declareIndexPlugin,renderWidget,usePlugin,WidgetLocation} from '@remnote/plugin-sdk';
import {synchronize,SHEET_ID} from '../src/core.mjs';
import {makeAdapter} from '../src/adapter';
import {CONNECTION_KEY,validateConnection,requestConnection} from './connection.mjs';
import '../src/style.css';
import './style.css';
function Panel(){
  const plugin=usePlugin();
  const [busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[config,setConfig]=useState<any>(null),[result,setResult]=useState<any>(null),[error,setError]=useState(''),[message,setMessage]=useState('Loading your connection…');
  useEffect(()=>{let active=true;(async()=>{try{const c=await plugin.storage.getLocal<any>(CONNECTION_KEY);const last=await plugin.storage.getLocal<any>('pyq-last-sync');if(!active)return;if(c)setConfig(validateConnection(c));if(last)setResult(last);setMessage(c?'Ready to check the PYQ sheet.':'Import your private connection file to get started.');}catch{if(active)setError('Import your connection file again.');}finally{if(active)setLoaded(true);}})();return()=>{active=false}},[]);
  async function importFile(event:React.ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    setError('');try{if(file.size>10000)throw new Error('Choose the small PYQ Sync connection JSON file.');let c;try{c=JSON.parse(await file.text())}catch{throw new Error('This file is not valid connection JSON.');}c=validateConnection(c);await plugin.storage.setLocal(CONNECTION_KEY,c);setConfig(c);setMessage('Connection saved on this device. Click Sync PYQ now.');}catch(e:any){setError(e.message)}
  }
  async function sync(){
    if(!config||busy)return;setBusy(true);setError('');setMessage('Reading the latest questions and answers…');
    try{
      if(!navigator.locks)throw new Error('This RemNote version does not support safe sync locking. Update RemNote before syncing.');
      await navigator.locks.request('pyq-sync:'+SHEET_ID,{ifAvailable:true},async lock=>{
        if(!lock)throw new Error('PYQ Sync is already running in another window.');
        const source=await requestConnection(config,'snapshot');
        const r=await synchronize(source,makeAdapter(plugin),(p:any)=>setMessage(`${p.message} (${p.done}/${p.total})`));
        if(r.bindings.length)await requestConnection(config,'ack',{bindings:r.bindings});
        const saved={...r,bindings:undefined,time:new Date().toLocaleString()};setResult(saved);await plugin.storage.setLocal('pyq-last-sync',saved);
        setMessage(r.created+r.updated>0?'Sync complete.':r.skipped===source.rows.length?'Waiting for answers to be generated in Google Sheets.':'Your cards are up to date.');
      });
    }catch(e:any){setError(e.message||'Sync could not finish.');setMessage('Sync stopped. Changes already completed are kept; retry to finish.');}finally{setBusy(false);}
  }
  return <main><div className="eyebrow">GOOGLE SHEETS → REMNOTE</div><h1>PYQ Sync</h1><p className="lead">Bring your latest lecture questions and answers into Anatomy PYQ.</p><div className="source"><span>Source</span><strong>PYQ · 11 anatomy tabs</strong><span>Destination</span><strong>Anatomy PYQ</strong></div><div className="connection"><label className="import">{config?'Replace connection file':'Import connection file'}<input type="file" accept=".json,application/json" onChange={importFile} disabled={!loaded||busy}/></label><small>{config?'Connection saved on this device.':'Choose PYQ Sync connection - PRIVATE.json.'}</small></div><button className="sync" disabled={!loaded||busy||!config} onClick={sync}>{busy?'Syncing…':'Sync PYQ now'}</button><p role="status" className="status">{message}</p>{error&&<p role="alert" className="error">{error}</p>}{result&&<section className="result"><div className="stats"><div><b>{result.created}</b>created</div><div><b>{result.updated}</b>updated</div><div><b>{result.unchanged}</b>unchanged</div></div><p>{result.skipped.toLocaleString()} questions waiting for usable answers.</p>{result.conflicts.length>0&&<details><summary>{result.conflicts.length} conflicts need review</summary><ul>{result.conflicts.map((c:string)=><li key={c}>{c}</li>)}</ul></details>}<small>Last check: {result.time}</small></section>}<a href={`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`} target="_blank" rel="noreferrer">Open PYQ sheet ↗</a><p className="foot">Keeps lecture order, numbered answers and existing cards. Sheet changes are applied when you press Sync. Unanswered questions wait for answers. Use one device at a time and keep this panel open until completion.</p></main>;
}
declare const __PYQ_WIDGET__:string;
if(__PYQ_WIDGET__==='index'){
 declareIndexPlugin(async plugin=>{
  await plugin.app.registerWidget('pyq_popup',WidgetLocation.Popup,{dimensions:{height:720,width:460}});
  await plugin.app.registerSidebarButton({id:'open-pyq-sync',name:'PYQ Sync',icon:'sync',action:()=>plugin.widget.openPopup('pyq_popup')});
  await plugin.app.registerCommand({id:'sync-pyq',name:'Open PYQ Sync',action:()=>plugin.widget.openPopup('pyq_popup')});
 },async()=>{});
}else renderWidget(Panel);
