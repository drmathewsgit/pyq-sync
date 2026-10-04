import {QBANK_NAME,QBANK_POWERUP} from './qbank-connection.mjs';

export async function registerQbank(plugin){
  await plugin.app.registerPowerup({name:QBANK_NAME,code:QBANK_POWERUP,description:'Lecture documents and cards maintained from the shared Anatomy PYQ Google Sheet.',options:{properties:[]}});
}

export async function ensureQbankRoot(plugin,kbId){
  const key=`qbank-root-v1:${kbId}`;
  const known=await plugin.storage.getSynced(key);
  const root=await plugin.powerup.getPowerupByCode(QBANK_POWERUP);
  if(!root)throw new Error('The question bank document is unavailable. Reopen the plugin, or restore its document from RemNote Trash.');
  if(known&&known!==root._id)throw new Error('The connected question bank document has changed. Restore the original document from Trash before syncing.');
  await root.setIsDocument(true);
  if(await plugin.richText.toString(root.text)!==QBANK_NAME)await root.setText([QBANK_NAME]);
  await plugin.storage.setSynced(key,root._id);
  return root;
}

// One runner in RemNote's index widget serializes all panel and command requests.
// It continues if a popup closes, and has no browser-lock or desktop dependency.
export function singleRunner(run){
  let active=null;
  return (...args)=>{
    if(active)return active;
    active=Promise.resolve().then(()=>run(...args)).finally(()=>{active=null;});
    return active;
  };
}
