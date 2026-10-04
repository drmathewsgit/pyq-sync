import {validateSnapshot,SHEET_ID} from './qbank-core.mjs';
export const STUDENT_ENDPOINT='https://script.google.com/macros/s/AKfycbyNrhzRUN0FbYZ3N_PxNlwMaDIykoG5j9YU-28ZhDu3_szixo7ZrBg9GlmO9ebOvxRkQg/exec';
export const QBANK_NAME='AnaBodhi';
export const QBANK_POWERUP='smAnatPyqBank';
export function studentSnapshot(value){
  if(value?.audience!=='pyq-students-v1'||value.spreadsheetId!==SHEET_ID)throw new Error('The shared Anatomy Qbank feed is not available yet. Please contact your teacher.');
  if(!Array.isArray(value.rows))throw new Error('The shared question bank returned an incomplete response.');
  // Only content and source identities are accepted; a remote RemNote ID is never used.
  const s={...value,rows:value.rows.map(r=>({sourceId:r.sourceId,region:r.region,lecture:r.lecture,order:r.order,question:r.question,answer:r.answer,ready:r.ready,remId:null}))};
  validateSnapshot(s);if(!s.tracking)throw new Error('Question tracking is missing. Existing cards were kept.');
  return s;
}
export async function fetchStudentSnapshot(fresh=false,fetcher=fetch){
  const url=STUDENT_ENDPOINT+'?action=student'+(fresh?'&fresh=1':'');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);
  try{
    const r=await fetcher(url,{method:'GET',credentials:'omit',cache:'no-store',redirect:'follow',signal:controller.signal});
    if(!r.ok)throw new Error('The shared question bank could not be reached. Try again later.');
    const body=await r.json();if(!body.ok)throw new Error(body.error||'The shared question bank is unavailable.');
    return studentSnapshot(body);
  }catch(e){if(e?.name==='AbortError')throw new Error('The question bank took too long to respond. Please retry.');throw e;}finally{clearTimeout(timer);}
}
export function studentStoragePrefix(kbId,rootId){
  if(!/^[-A-Za-z0-9_]+$/.test(kbId)||!/^[-A-Za-z0-9_]+$/.test(rootId))throw new Error('RemNote did not identify the current knowledge base.');
  return `qbank-v1:${SHEET_ID}:${kbId}:${rootId}:`;
}

export function studentLecturePositions(lectures){
  /** @type {Record<string, number>} */
  const counts={};
  /** @type {Record<string, number>} */
  const positions={};
  for(const l of [...lectures].sort((a,b)=>a.sequence-b.sequence)){
    const region=l.code.split('-')[0];positions[l.code]=counts[region]||0;counts[region]=(counts[region]||0)+1;
  }
  return positions;
}
