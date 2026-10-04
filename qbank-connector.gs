// PYQ Sync: this connector can access only the spreadsheet below.
const PYQ_SHEET = '1Do_rqCkcn2Picm09r9z0EQ6lTbCJ9yESr6MfBxlBw20';
const PYQ_AUTH_HASH = '';
const PYQ_REGIONS = ['GE','UL','LL','AB','PP','T','HN','NA','EG','H','AC'];
const PYQ_ID_KEY = 'pyq_sync';
const PYQ_KB = '';

function doGet(e) {
  if(!e||!e.parameter||e.parameter.action!=='student')return json_({ok:true,name:'PYQ Sync',authenticated:false});
  try{
    const fresh=e.parameter.fresh==='1';
    if(!fresh){const cached=studentCacheRead_();if(cached)return json_(cached);}
    const lock=LockService.getScriptLock();
    if(!lock.tryLock(20000))throw new Error('The class feed is busy. Try again in a moment.');
    try{
      if(!fresh){const cached=studentCacheRead_();if(cached)return json_(cached);}
      const result=studentSnapshot_(snapshot_(SpreadsheetApp.openById(PYQ_SHEET)));
      studentCacheWrite_(result);return json_(result);
    }finally{lock.releaseLock();}
  }catch(err){return json_({ok:false,error:err.message||String(err)});}
}
// Public student reads never accept card IDs or credentials. Only the fixed
// sheet's learning content and stable question identities leave this endpoint.
function studentSnapshot_(s){
  const lectures=s.lectures.filter(l=>!['GE-T2','GE-TEST'].includes(l.code)&&!/^TEMPORARY SYNC TEST/.test(l.title)).map(l=>({code:l.code,title:l.title,sequence:l.sequence}));
  const codes=new Set(lectures.map(l=>l.code));
  return {ok:true,audience:'pyq-students-v1',spreadsheetId:PYQ_SHEET,lectures,
    rows:s.rows.filter(r=>codes.has(r.lecture)).map(r=>({sourceId:r.sourceId,region:r.region,lecture:r.lecture,order:r.order,question:r.question,answer:r.answer,ready:r.ready})),
    warnings:s.warnings,skippedRows:s.skippedRows,tracking:s.tracking,readAt:s.readAt};
}
function studentCacheRead_(){
  try{const cache=CacheService.getScriptCache(),info=JSON.parse(cache.get('pyq-students-head')||'null');if(!info||info.count>400)return null;
    let raw='';for(let n=0;n<info.count;n++){const part=cache.get(info.key+':'+n);if(part===null)return null;raw+=part;}return JSON.parse(raw);
  }catch{return null;}
}
function studentCacheWrite_(value){
  try{const raw=JSON.stringify(value),count=Math.ceil(raw.length/30000);if(count>400)return;
    const cache=CacheService.getScriptCache(),key='pyq-students-'+Utilities.getUuid();
    for(let n=0;n<count;n++)cache.put(key+':'+n,raw.slice(n*30000,(n+1)*30000),60);
    cache.put('pyq-students-head',JSON.stringify({key,count}),30);
  }catch{/* Cache failure must not prevent a complete live sheet read. */}
}
function doPost(e) {
  try {
    if (!e || !e.postData || e.postData.contents.length > 2000000) throw new Error('Invalid request.');
    const req=JSON.parse(e.postData.contents);
    if(typeof req.token!=='string'||digest_(req.token)!==PYQ_AUTH_HASH) return json_({ok:false,error:'Unauthorized'});
    const lock=LockService.getScriptLock();
    if(!lock.tryLock(10000))throw new Error('Another sync is running. Try again shortly.');
    try {
      const sheet=SpreadsheetApp.openById(PYQ_SHEET);
      if(req.action==='snapshot')return json_(snapshot_(sheet));
      if(req.action==='ack')return json_(ack_(sheet,req.bindings));
      throw new Error('Unknown action.');
    } finally {lock.releaseLock();}
  } catch(err) {return json_({ok:false,error:err.message||String(err)});}
}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
function digest_(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');}
function text_(s){return String(s==null?'':s).trim();}
function ready_(s){s=text_(s);return !!s&&!/^(?:=|#(?:ERROR!|REF!|N\/A|VALUE!|NAME\?|DIV\/0!|NUM!|SPILL!|CALC!|LOADING))/.test(s)&&!/^(?:1[.)]\s*)?REVIEW\s*:/i.test(s)&&!/^(?:Please generate|Loading|Generating|You've reached the daily limit)/i.test(s);}
function remId_(s){const m=text_(s).match(/^https:\/\/www\.remnote\.com\/w\/[A-Za-z0-9_-]+\/([A-Za-z0-9_-]+)$/);return m?m[1]:null;}
function snapshot_(book){
  const index=book.getSheetByName('L load');if(!index)throw new Error('The L load tab is missing.');
  const lectures=index.getRange(2,2,Math.max(1,index.getLastRow()-1),4).getValues().filter(r=>r[0]&&r[1]).map(r=>({code:text_(r[0]),title:text_(r[1]),sequence:Number(r[3])||0}));
  const codes=new Set(lectures.map(l=>l.code));
  const rows=[],warnings=[];let skippedRows=0;
  for(const region of PYQ_REGIONS){
    const tab=book.getSheetByName(region);if(!tab)throw new Error('Missing tab: '+region);
    const data=tab.getRange(1,1,Math.max(1,tab.getLastRow()),tab.getLastColumn()).getValues();
    const header=data.findIndex(r=>r[0]==='Lecture Code'&&r[2]==='Question'&&r[3]==='Answers');
    if(header<0)throw new Error('The Lecture Code, Question or Answers header is missing in '+region+'. Restore the headers and retry.');
    const remColumn=data[header].findIndex(h=>text_(h).toLowerCase()==='remnotes');
    const metadata=tab.createDeveloperMetadataFinder().withKey(PYQ_ID_KEY).find();
    const byRow=new Map();
    for(const m of metadata){const row=m.getLocation().getRow();if(row){const n=row.getRow();if(byRow.has(n))throw new Error('Duplicate question tracking metadata in '+region+'.');byRow.set(n,m);}}
    for(let n=header+1;n<data.length;n++){
      const r=data[n],question=text_(r[2]);if(!question)continue;
      const lecture=text_(r[0]);
      if(!codes.has(lecture)){warnings.push(region+' row '+(n+1)+': choose a valid Lecture Code from L load. This question was skipped.');skippedRows++;continue;}
      const answer=text_(r[3]),ready=ready_(answer),link=remColumn<0?'':text_(r[remColumn]);
      if(ready&&link&&!remId_(link))throw new Error('An existing Remnotes value in '+region+' row '+(n+1)+' is unrecognized; it was preserved.');
      let meta=byRow.get(n+1);
      // Only questions with usable answers need persistent identities.
      if(ready&&!meta){const row=tab.getRange((n+1)+':'+(n+1));row.addDeveloperMetadata(PYQ_ID_KEY,SpreadsheetApp.DeveloperMetadataVisibility.DOCUMENT);meta=row.getDeveloperMetadata().find(m=>m.getKey()===PYQ_ID_KEY);if(!meta)throw new Error('Could not assign question identity.');}
      let cardId=meta?text_(meta.getValue()):'';
      if(cardId&&!/^[-A-Za-z0-9_]+$/.test(cardId))throw new Error('Invalid stored card identity in '+region+'.');
      const legacyId=remId_(link);
      if(cardId&&legacyId&&cardId!==legacyId)throw new Error('Existing card identities disagree in '+region+'.');
      if(meta&&!cardId&&legacyId){meta.setValue(legacyId);cardId=legacyId;}
      rows.push({sourceId:meta?'g'+meta.getId():null,region,lecture,order:Number(r[1])||n,question,answer:ready?answer:'',ready,remId:cardId||legacyId||null});
    }
  }
  // Include every surviving identity, even on blank/incomplete rows or rows
  // moved outside a region. Only physical removal loses whole-row metadata.
  const sourceIds=book.createDeveloperMetadataFinder().withKey(PYQ_ID_KEY).find().map(m=>'g'+m.getId());
  return {ok:true,spreadsheetId:PYQ_SHEET,lectures,rows,warnings,skippedRows,tracking:{version:1,complete:true,regions:PYQ_REGIONS,sourceIds},readAt:new Date().toISOString()};
}
function ack_(book,bindings){
  if(!Array.isArray(bindings)||bindings.length>10000)throw new Error('Invalid card bindings.');
  const byId=new Map(book.createDeveloperMetadataFinder().withKey(PYQ_ID_KEY).find().map(m=>['g'+m.getId(),m]));
  const writes=[],warnings=[],seen=new Set();
  for(const b of bindings){
    if(!/^g\d+$/.test(b.sourceId)||!/^[-A-Za-z0-9_]+$/.test(b.remId)||seen.has(b.sourceId))throw new Error('Invalid or duplicate card binding.');seen.add(b.sourceId);
    const meta=byId.get(b.sourceId),row=meta&&meta.getLocation().getRow();
    if(!row){warnings.push('A question row was removed during sync. Its card will be checked for removal on the next sync.');continue;}
    const tab=row.getSheet();if(!PYQ_REGIONS.includes(tab.getName()))throw new Error('Question identity is outside PYQ tabs.');
    const old=text_(meta.getValue());
    if(old&&old!==b.remId)throw new Error('An existing card identity changed during sync; it was preserved.');
    if(!old)writes.push([meta,b.remId]);
  }
  for(const [meta,remId] of writes)meta.setValue(remId);
  return {ok:true,linked:writes.length,warnings};
}
