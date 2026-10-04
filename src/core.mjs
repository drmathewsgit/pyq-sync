export const SHEET_ID = '1Do_rqCkcn2Picm09r9z0EQ6lTbCJ9yESr6MfBxlBw20';
export const ROOT_ID = 'OPqM81XR10WwpOt96';
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
export async function synchronize(snapshot, adapter, report = progress => {}) {
  validateSnapshot(snapshot);
  const result = {created:0, updated:0, unchanged:0, adopted:0, skipped:0, conflicts:[], bindings:[]};
  const rows = snapshot.rows.filter(r => r.ready && answerReady(r.answer));
  result.skipped = snapshot.rows.length - rows.length;
  await adapter.assertRoot();
  if (!rows.length) return result;
  const lectures = new Map(snapshot.lectures.map(l => [l.code,l]));
  const index = await adapter.indexExisting();
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
      if (saved?.question !== undefined && (normalize(card.question)!==normalize(saved.question) || card.answer.trim()!==String(saved.answer).trim())) {
        if (normalize(card.question)!==normalize(target.question) || card.answer.trim()!==target.answer) {result.conflicts.push(`${row.lecture} ${row.order}: card was edited in RemNote`);continue;}
      }
      const changed = card.question!==target.question || card.answer.trim()!==target.answer || card.parent!==parent;
      if (changed) {await adapter.updateCard(card.id,target);result.updated++;} else result.unchanged++;
      await adapter.saveMapping(row.sourceId,{remId:card.id,...target});
      if(adopted) result.adopted++;
    }
    used.add(card.id);
    result.bindings.push({sourceId:row.sourceId,remId:card.id});
  }
  await adapter.orderCards(rows,result.bindings);
  report({done:rows.length,total:rows.length,message:'Saving card links…'});
  return result;
}
