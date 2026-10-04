import {QBANK_NAME,QBANK_POWERUP} from './qbank-connection.mjs';

export async function registerQbank(plugin){
  await plugin.app.registerPowerup({name:QBANK_NAME,code:QBANK_POWERUP,description:'Lecture documents and cards maintained from the shared Anatomy PYQ Google Sheet.',options:{properties:[]}});
}

export async function ensureQbankRoot(plugin,kbId){
  const key=`qbank-root-v1:${kbId}`;
  let root=await plugin.powerup.getPowerupByCode(QBANK_POWERUP);
  if(!root){await registerQbank(plugin);root=await plugin.powerup.getPowerupByCode(QBANK_POWERUP);}
  if(!root)throw new Error('RemNote could not create the AnaBodhi folder. Reopen the plugin and retry Sync.');
  await root.setIsDocument(true);
  await root.setIsFolder(true);
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
