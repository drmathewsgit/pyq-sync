import {SHEET_ID,ROOT_ID} from '../src/core.mjs';
export const ENDPOINT='https://script.google.com/macros/s/AKfycbyNrhzRUN0FbYZ3N_PxNlwMaDIykoG5j9YU-28ZhDu3_szixo7ZrBg9GlmO9ebOvxRkQg/exec';
export const CONNECTION_KEY='pyq-private-connection-v1';
export function validateConnection(c){
  if(c?.schema!=='pyq-sync-connection-v1'||c.spreadsheetId!==SHEET_ID||c.rootId!==ROOT_ID||c.endpoint!==ENDPOINT||typeof c.token!=='string'||c.token.length<32||c.token.length>512)throw new Error('Choose the private PYQ Sync connection JSON supplied with this plugin.');
  return {schema:c.schema,spreadsheetId:SHEET_ID,rootId:ROOT_ID,endpoint:ENDPOINT,token:c.token};
}
export async function requestConnection(config,action,data={},fetcher=fetch){
  const c=validateConnection(config);
  if(!['snapshot','ack'].includes(action))throw new Error('Unsupported sync action.');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),120000);
  try{
    const response=await fetcher(c.endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},credentials:'omit',redirect:'follow',body:JSON.stringify({...data,action,token:c.token}),signal:controller.signal});
    if(!response.ok)throw new Error('Google could not complete the request. Try again shortly.');
    let result;try{result=await response.json()}catch{throw new Error('Google returned an unexpected response. Check the connector deployment.');}
    if(!result.ok)throw new Error(result.error==='Unauthorized'?'The connection key was rejected. Import the current connection file.':String(result.error||'The sheet connection is unavailable.'));
    return result;
  }catch(e){if(e?.name==='AbortError')throw new Error('Google took too long to respond. You can safely try again.');if(e instanceof TypeError)throw new Error('Unable to reach Google. Check your connection and try again.');throw e;}finally{clearTimeout(timer);}
}
