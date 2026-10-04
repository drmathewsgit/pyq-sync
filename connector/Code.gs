// PYQ Sync: this connector can access only the spreadsheet below.
const PYQ_SHEET = '1Do_rqCkcn2Picm09r9z0EQ6lTbCJ9yESr6MfBxlBw20';
const PYQ_AUTH_HASH = '72841ce9f563c4bf24847ad7816cbf129ede054659c40e6627468f71d0c36409';
const PYQ_REGIONS = ['GE','UL','LL','AB','PP','T','HN','NA','EG','H','AC'];
const PYQ_ID_KEY = 'pyq_sync';
const PYQ_KB = '6002d7aaaa5ef000453cee25';

function doGet() { return json_({ok:true,name:'PYQ Sync',authenticated:false}); }
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
function remId_(s){const m=text_(s).match(/^https:\/\/www\.remnote\.com\/w\/6002d7aaaa5ef000453cee25\/([A-Za-z0-9_-]+)$/);return m?m[1]:null;}
function snapshot_(book){
  const index=book.getSheetByName('L load');if(!index)throw new Error('The L load tab is missing.');
  const lectures=index.getRange(2,2,Math.max(1,index.getLastRow()-1),4).getValues().filter(r=>r[0]&&r[1]).map(r=>({code:text_(r[0]),title:text_(r[1]),sequence:Number(r[3])||0}));
  const codes=new Set(lectures.map(l=>l.code));
  const rows=[];
  for(const region of PYQ_REGIONS){
    const tab=book.getSheetByName(region);if(!tab)throw new Error('Missing tab: '+region);
    const data=tab.getRange(1,1,Math.max(1,tab.getLastRow()),8).getValues();
    if(data[0][0]!=='Lecture Code'||data[0][2]!=='Question'||data[0][3]!=='Answers'||data[0][7]!=='Remnotes')throw new Error('Unexpected columns in '+region+'.');
    const metadata=tab.createDeveloperMetadataFinder().withKey(PYQ_ID_KEY).find();
    const byRow=new Map();
    for(const m of metadata){const row=m.getLocation().getRow();if(row){const n=row.getRow();if(byRow.has(n))throw new Error('Duplicate question tracking metadata in '+region+'.');byRow.set(n,m);}}
    for(let n=1;n<data.length;n++){
      const r=data[n],question=text_(r[2]);if(!question)continue;
      const lecture=text_(r[0]);if(!codes.has(lecture))throw new Error('Unlisted lecture '+lecture+' in '+region+'.');
      const answer=text_(r[3]),ready=ready_(answer),link=text_(r[7]);
      if(ready&&link&&!remId_(link))throw new Error('The Remnotes cell '+region+'!H'+(n+1)+' already contains an unrecognized value; it was preserved.');
      let meta=byRow.get(n+1);
      // Only questions with usable answers need persistent identities.
      if(ready&&!meta){const row=tab.getRange((n+1)+':'+(n+1));row.addDeveloperMetadata(PYQ_ID_KEY,SpreadsheetApp.DeveloperMetadataVisibility.DOCUMENT);meta=row.getDeveloperMetadata().find(m=>m.getKey()===PYQ_ID_KEY);if(!meta)throw new Error('Could not assign question identity.');}
      rows.push({sourceId:meta?'g'+meta.getId():null,region,lecture,order:Number(r[1])||n,question,answer:ready?answer:'',ready,remId:remId_(link)});
    }
  }
  return {ok:true,spreadsheetId:PYQ_SHEET,lectures,rows,readAt:new Date().toISOString()};
}
function ack_(book,bindings){
  if(!Array.isArray(bindings)||bindings.length>10000)throw new Error('Invalid card bindings.');
  const byId=new Map(book.createDeveloperMetadataFinder().withKey(PYQ_ID_KEY).find().map(m=>['g'+m.getId(),m]));
  const writes=[],seen=new Set();
  for(const b of bindings){
    if(!/^g\d+$/.test(b.sourceId)||!/^[-A-Za-z0-9_]+$/.test(b.remId)||seen.has(b.sourceId))throw new Error('Invalid or duplicate card binding.');seen.add(b.sourceId);
    const meta=byId.get(b.sourceId),row=meta&&meta.getLocation().getRow();if(!row)throw new Error('A question was removed during sync.');
    const tab=row.getSheet();if(!PYQ_REGIONS.includes(tab.getName()))throw new Error('Question identity is outside PYQ tabs.');
    const cell=tab.getRange(row.getRow(),8),old=text_(cell.getValue()),link='https://www.remnote.com/w/'+PYQ_KB+'/'+b.remId;
    if(old&&old!==link)throw new Error('An existing card link changed during sync; it was preserved.');
    if(!old)writes.push([cell,link]);
  }
  for(const [cell,link] of writes)cell.setValue(link);
  return {ok:true,linked:writes.length};
}
