import test from 'node:test';
import assert from 'node:assert/strict';
import {synchronize,answerReady,SHEET_ID,normalize} from '../src/core.mjs';
const lecture={code:'UL-1',title:'Upper limb (AN 8.1)',sequence:1};
const row={sourceId:'g1',region:'UL',lecture:'UL-1',order:1,question:'Name the bone.',answer:'1. Clavicle',ready:true};
const snapshot=(rows=[row])=>({ok:true,spreadsheetId:SHEET_ID,lectures:[lecture],rows});
function mock(existing=[]){
  const cards=new Map(existing.map(c=>[c.id,{...c}])),mappings=new Map();let writes=0;
  return {cards,mappings,get writes(){return writes},assertRoot:async()=>{},indexExisting:async()=>{const m=new Map();for(const c of cards.values()){const k=normalize(c.question).toLocaleLowerCase();m.set(k,[...(m.get(k)||[]),{...c}]);}return m;},getMapping:async id=>mappings.get(id),getCard:async id=>cards.get(id),ensureLecture:async()=> 'lecture-1',saveMapping:async(id,v)=>mappings.set(id,v),createCard:async(id,v)=>{const c={id:'card-'+(cards.size+1),...v};cards.set(c.id,c);mappings.set(id,{remId:c.id,...v});writes++;return c;},updateCard:async(id,v)=>{Object.assign(cards.get(id),v);writes++;},orderCards:async()=>{}};
}
test('pending, error, REVIEW and formula answers are never imported',async()=>{
  for(const a of ['', '=AI("prompt",C2)','#ERROR!','1. REVIEW: missing image','REVIEW: ambiguous','Generating…'])assert.equal(answerReady(a),false);
  const a=mock();const r=await synchronize(snapshot([{...row,sourceId:null,answer:'',ready:false}]),a);assert.equal(r.skipped,1);assert.equal(a.writes,0);
});
test('repeated sync and question renumbering reuse the original card',async()=>{
  const a=mock();await synchronize(snapshot(),a);const r=await synchronize(snapshot([{...row,order:22}]),a);assert.equal(a.cards.size,1);assert.equal(r.unchanged,1);assert.equal(r.created,0);
});
test('changed source question and numbered multiline answer update in place',async()=>{
  const a=mock();await synchronize(snapshot(),a);const changed={...row,question:'Identify this bone.',answer:'1. Clavicle\n2. Upper limb'};const r=await synchronize(snapshot([changed]),a);assert.equal(r.updated,1);assert.equal(a.cards.size,1);assert.equal(a.cards.get('card-1').answer,changed.answer);
});
test('unique pre-existing question is adopted, not duplicated',async()=>{
  const a=mock([{id:'old-card',question:row.question,answer:'Old answer',parent:'old-lecture'}]);const r=await synchronize(snapshot(),a);assert.equal(r.adopted,1);assert.equal(r.created,0);assert.equal(a.cards.size,1);assert.equal(r.bindings[0].remId,'old-card');
});
test('manual RemNote edits cause a conflict and remain intact',async()=>{
  const a=mock();await synchronize(snapshot(),a);a.cards.get('card-1').answer='My annotation';const r=await synchronize(snapshot([{...row,answer:'1. Revised'}]),a);assert.equal(r.conflicts.length,1);assert.equal(a.cards.get('card-1').answer,'My annotation');
});
test('missing mapped card is never silently recreated',async()=>{
  const a=mock();a.mappings.set('g1',{remId:'missing'});const r=await synchronize(snapshot(),a);assert.equal(r.conflicts.length,1);assert.equal(a.cards.size,0);
});
test('duplicate source identities and questions stop before any writes',async()=>{
  for(const rows of [[row,{...row,question:'Different'}],[row,{...row,sourceId:'g2'}]]){const a=mock();await assert.rejects(()=>synchronize(snapshot(rows),a));assert.equal(a.writes,0);}
});
test('wrong spreadsheet stops before any writes',async()=>{
  const a=mock();await assert.rejects(()=>synchronize({...snapshot(),spreadsheetId:'wrong'},a));assert.equal(a.writes,0);
});
test('two cards matching one question are reported without changes',async()=>{
  const a=mock(['a','b'].map(id=>({id,question:row.question,answer:'old',parent:'p'})));const r=await synchronize(snapshot(),a);assert.equal(r.conflicts.length,1);assert.equal(a.writes,0);
});
