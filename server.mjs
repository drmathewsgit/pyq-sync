import http from 'node:http';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
const ROOT=dirname(fileURLToPath(import.meta.url));
const PORT=27182;
const allowedHosts=new Set([`localhost:${PORT}`,`127.0.0.1:${PORT}`]);
const allowedOrigins=new Set([`http://localhost:${PORT}`,`http://127.0.0.1:${PORT}`]);
let active=null;
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
async function getBody(req){let value='';for await(const chunk of req){value+=chunk;if(value.length>2000000)throw new Error('Request too large.');}return JSON.parse(value||'{}');}
async function config(){const c=JSON.parse(await readFile(resolve(ROOT,'.connection.json'),'utf8'));if(!c.endpoint||!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(c.endpoint))throw new Error('Finish connecting PYQ Sync to Google Sheets before syncing.');return c;}
async function callSheet(action,data){
  const c=await config();
  const response=await fetch(c.endpoint,{method:'POST',body:JSON.stringify({token:c.token,action,...data}),headers:{'Content-Type':'text/plain'},signal:AbortSignal.timeout(240000),redirect:'follow'});
  if(!response.ok)throw new Error('Google Sheets connection returned HTTP '+response.status+'.');
  const raw=await response.text();let result;try{result=JSON.parse(raw)}catch{throw new Error('Google requires connection authorization. Check the PYQ Sync deployment.');}
  if(!result.ok)throw new Error(result.error||'Google Sheets sync failed.');return result;
}
const server=http.createServer(async(req,res)=>{
  try{
    if(!allowedHosts.has(req.headers.host||''))return json(res,403,{ok:false,error:'Forbidden'});
    const url=new URL(req.url,'http://localhost');
    const path=url.pathname;
    if(path!=='/api/sync')console.log(req.method+' '+path+(url.searchParams.has('widgetName')?' widget='+url.searchParams.get('widgetName'):''));
    if(path==='/api/diagnostic'&&req.method==='POST'&&allowedOrigins.has(req.headers.origin||'')&&req.headers['x-pyq-sync']==='1'){
      const body=await getBody(req);console.log('Plugin: '+String(body.stage).slice(0,800));return json(res,200,{ok:true});
    }
    if(path==='/api/sync'){
      if(req.method!=='POST'||!allowedOrigins.has(req.headers.origin||'')||req.headers['x-pyq-sync']!=='1')return json(res,403,{ok:false,error:'Forbidden'});
      const body=await getBody(req);const now=Date.now();
      if(active&&now-active.at>15*60*1000)active=null;
      if(body.action==='begin'){
        if(active)return json(res,409,{ok:false,error:'A PYQ sync is already running. Please wait for it to finish.'});
        await config();active={id:randomBytes(24).toString('hex'),at:now};return json(res,200,{ok:true,lock:active.id});
      }
      if(!active||body.lock!==active.id)return json(res,409,{ok:false,error:'The sync session expired. Start a new sync.'});
      active.at=now;
      if(body.action==='end'){active=null;return json(res,200,{ok:true});}
      if(!['snapshot','ack'].includes(body.action))return json(res,400,{ok:false,error:'Unknown action.'});
      const result=await callSheet(body.action,body.action==='ack'?{bindings:body.bindings}:{});return json(res,200,result);
    }
    const files={'/':'index.html','/index.html':'index.html','/manifest.json':'manifest.json','/index.js':'index.js','/index-sandbox.js':'index-sandbox.js','/pyq_popup.js':'pyq_popup.js','/pyq_popup-sandbox.js':'pyq_popup-sandbox.js','/App.css':'App.css','/snippet.css':'snippet.css'};
    if(req.method!=='GET'||!files[path])return json(res,404,{ok:false,error:'Not found'});
    const file=files[path];const data=await readFile(resolve(ROOT,'dist',file));
    res.writeHead(200,{'Content-Type':file.endsWith('.json')?'application/json':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff'});res.end(data);
  }catch(e){json(res,500,{ok:false,error:e.message||'Sync failed.'});}
});
server.listen(PORT,'127.0.0.1',()=>console.log(`PYQ Sync available at http://localhost:${PORT}`));
