export const SHEET_ID = '1Do_rqCkcn2Picm09r9z0EQ6lTbCJ9yESr6MfBxlBw20';
export const REGIONS = ['GE','UL','LL','AB','PP','T','HN','NA','EG','H','AC'];
export const normalize = s => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
export function answerReady(answer) {
  const s = String(answer ?? '').trim();
  return !!s && !/^(?:=|#(?:ERROR!|REF!|N\/A|VALUE!|NAME\?|DIV\/0!|NUM!|SPILL!|CALC!|LOADING))/.test(s)
    && !/^(?:1[.)]\s*)?REVIEW\s*:/i.test(s)
    && !/^(?:Please generate|Loading|Generating|You've reached the daily limit)/i.test(s);
}
export function validateSnapshot(s) {
  if (!s?.ok || s.spreadsheetId !== SHEET_ID || !Array.isArray(s.rows) || !Array.isArray(s.lectures)) throw new Error('The connection did not return the PYQ sheet.');
  const lectureMap = new Map(s.lectures.map(l => [l.code,l]));
  const ids = new Set(), questions = new Set();
  if (s.tracking) {
    const t=s.tracking;
    if(t.version!==1||t.complete!==true||!Array.isArray(t.regions)||t.regions.length!==REGIONS.length||!REGIONS.every(r=>t.regions.includes(r))||!Array.isArray(t.sourceIds)||t.sourceIds.some(id=>!/^g\d+$/.test(id))||new Set(t.sourceIds).size!==t.sourceIds.length)throw new Error('Question tracking is incomplete. Existing cards were kept.');
    const present=new Set(t.sourceIds);
    if(s.rows.some(r=>r.sourceId&&!present.has(r.sourceId)))throw new Error('The sheet changed while being read. Retry sync.');
  }
  for (const r of s.rows) {
    if (!REGIONS.includes(r.region) || !lectureMap.has(r.lecture) || !normalize(r.question)) throw new Error('A source question has an invalid lecture or region.');
    if (r.ready) {
      if (!/^g\d+$/.test(r.sourceId) || ids.has(r.sourceId)) throw new Error('Duplicate or missing question identity. Sync stopped to prevent duplicate cards.');
      ids.add(r.sourceId);
      if (!answerReady(r.answer)) throw new Error('An unfinished answer was marked ready.');
      const q = normalize(r.question).toLocaleLowerCase();
      if (questions.has(q)) throw new Error('The sheet contains the same ready question more than once. Resolve the overlap before syncing.');
      questions.add(q);
    }
  }
  return s;
}

// All writes go through an adapter that verifies the target remains inside Anatomy PYQ.
export async function synchronize(snapshot, adapter, report = progress => {}, rereadSource = null) {
  validateSnapshot(snapshot);
  const result = {created:0, updated:0, unchanged:0, trashed:0, adopted:0, skipped:0, conflicts:[], warnings:(snapshot.warnings||[]).filter(w=>typeof w==='string'), bindings:[]};
  const rows = snapshot.rows.filter(r => r.ready && answerReady(r.answer));
  result.skipped = snapshot.rows.length - rows.length + (Number(snapshot.skippedRows)||0);
  await adapter.assertRoot();
  // Enrol older mappings while their source row still exists, including rows
  // whose answers have been cleared. Never infer removal from answer readiness.
  for(const row of snapshot.rows){
    if(!row.sourceId)continue;
    const saved=await adapter.getMapping(row.sourceId);
    if(saved?.remId)await adapter.trackMapping(row.sourceId,saved.remId);
    else if(row.remId)await adapter.trackMapping(row.sourceId,row.remId);
  }
  const lectures = new Map(snapshot.lectures.map(l => [l.code,l]));
  const index = rows.length ? await adapter.indexExisting() : new Map();
  const used = new Set();
  rows.sort((a,b) => (lectures.get(a.lecture).sequence - lectures.get(b.lecture).sequence) || a.order-b.order);
  for (let n=0; n<rows.length; n++) {
    const row=rows[n]; report({done:n,total:rows.length,message:`${row.lecture} · question ${row.order}`});
    const saved = await adapter.getMapping(row.sourceId);
    if (saved?.remId && row.remId && saved.remId !== row.remId) {result.conflicts.push(`${row.lecture} ${row.order}: card links disagree`);continue;}
    let id = saved?.remId || row.remId;
    let card = id ? await adapter.getCard(id) : null;
    if (id && !card) {result.conflicts.push(`${row.lecture} ${row.order}: linked card is missing or outside Anatomy PYQ`);continue;}
    let adopted=false;
    if (!card) {
      const candidates = index.get(normalize(row.question).toLocaleLowerCase()) || [];
      if (candidates.length>1) {result.conflicts.push(`${row.lecture} ${row.order}: multiple existing cards match`);continue;}
      if (candidates.length===1) { card=candidates[0]; adopted=true; }
    }
    if (card && used.has(card.id)) {result.conflicts.push(`${row.lecture} ${row.order}: another question already uses this card`);continue;}
    const parent = await adapter.ensureLecture(lectures.get(row.lecture), row.region);
    const target = {question:row.question.trim(),answer:row.answer.trim(),parent,order:row.order};
    if (!card) {
      card = await adapter.createCard(row.sourceId,target);
      result.created++;
    } else {
      // A manually edited synchronized card is not overwritten silently.
      if (!adapter.sourceAuthoritative && saved?.question !== undefined && (normalize(card.question)!==normalize(saved.question) || card.answer.trim()!==String(saved.answer).trim())) {
        if (normalize(card.question)!==normalize(target.question) || card.answer.trim()!==target.answer) {result.conflicts.push(`${row.lecture} ${row.order}: card was edited in RemNote`);continue;}
      }
      if (adapter.protectUntracked && saved?.question === undefined && (normalize(card.question)!==normalize(target.question)||card.answer.trim()!==target.answer||card.parent!==parent)) {result.conflicts.push(`${row.lecture} ${row.order}: existing card has no saved sync baseline; personal content kept`);continue;}
      const changed = card.question!==target.question || card.answer.trim()!==target.answer || card.parent!==parent;
      if (changed) {await adapter.updateCard(card.id,target);result.updated++;} else result.unchanged++;
      await adapter.saveMapping(row.sourceId,{remId:card.id,...target});
      if(adopted) result.adopted++;
    }
    used.add(card.id);
    result.bindings.push({sourceId:row.sourceId,remId:card.id});
  }
  await adapter.orderCards(rows,result.bindings);
  await trashRemovedRows(snapshot,adapter,result,rereadSource,report);
  report({done:rows.length,total:rows.length,message:'Saving card links…'});
  return result;
}

async function trashRemovedRows(snapshot,adapter,result,rereadSource,report){
  if(!snapshot.tracking){result.warnings.push('Update the Google connector to enable deleted-row sync. Existing cards were kept.');return;}
  const present=new Set(snapshot.tracking.sourceIds);
  const tracked=await adapter.getTrackedMappings();
  const candidates=Object.entries(tracked).filter(([id])=>!present.has(id));
  if(!candidates.length)return;
  let fresh;
  try{
    if(!rereadSource)throw new Error('No fresh sheet check is available.');
    report({done:0,total:candidates.length,message:'Confirming removed question rows…'});
    fresh=validateSnapshot(await rereadSource());
    if(!fresh.tracking)throw new Error('Question tracking is unavailable.');
  }catch{result.warnings.push('Could not confirm removed rows with Google Sheets. Existing cards were kept; retry sync.');return;}
  const stillPresent=new Set(fresh.tracking.sourceIds);
  const liveCardIds=new Set([...snapshot.rows,...fresh.rows].map(r=>r.remId).filter(Boolean));
  for(const id of stillPresent)if(tracked[id])liveCardIds.add(tracked[id]);
  for(const [sourceId,remId] of candidates){
    if(stillPresent.has(sourceId))continue;
    if(liveCardIds.has(remId)){result.conflicts.push(`${sourceId}: another sheet row still uses this card`);continue;}
    const saved=await adapter.getMapping(sourceId),card=await adapter.getCard(remId);
    if(!saved||saved.remId!==remId||saved.question===undefined||saved.answer===undefined){result.conflicts.push(`${sourceId}: removed row has no verified card baseline; card kept`);continue;}
    if(!card){result.conflicts.push(`${sourceId}: removed row's card is already missing or outside Anatomy PYQ`);continue;}
    if(!adapter.sourceAuthoritative&&(normalize(card.question)!==normalize(saved.question)||card.answer.trim()!==String(saved.answer).trim()||card.parent!==saved.parent)){result.conflicts.push(`${sourceId}: removed row's card was edited or moved in RemNote; card kept`);continue;}
    try{
      await adapter.trashCard(remId);
      await adapter.untrackMapping(sourceId);
      result.trashed++;
    }catch(e){result.warnings.push(`${sourceId}: ${e.message||'Could not move card to Trash. Retry sync.'}`);}
  }
}
