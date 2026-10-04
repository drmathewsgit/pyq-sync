import type {RNPlugin} from '@remnote/plugin-sdk';
import type {RemObject} from '@remnote/plugin-sdk/dist/name_spaces/rem';
import {REGIONS, normalize} from './qbank-core.mjs';
export function makeScopedAdapter(plugin: RNPlugin, options: {rootId:string;rootName:string;storagePrefix?:string;protectUntracked?:boolean;sourceAuthoritative?:boolean;lecturePositions?:Record<string,number>;beforeWrite?:()=>Promise<void>}) {
  const rootId=options.rootId,rootName=options.rootName,prefix=options.storagePrefix||'';
  const beforeWrite=options.beforeWrite||(()=>Promise.resolve());
  const cache=new Map<string,RemObject>();
  const lectures=new Map<string,string>();
  const plain=(t:any) => plugin.richText.toString(t || []);
  const mappingKey=(id:string) => `${prefix}pyq-card-v1:${id}`;
  const trackedKey=prefix+'pyq-tracked-cards-v1';
  async function inside(rem:RemObject) {
    let r:RemObject|undefined=rem;
    for(let n=0;r&&n<30;n++) {if(r._id===rootId)return true;r=r.parent ? await plugin.rem.findOne(r.parent):undefined;}
    return false;
  }
  async function view(r:RemObject) {return {id:r._id,question:await plain(r.text),answer:await plain(r.backText),parent:r.parent};}
  async function richAnswer(answer:string) {
    const lines=answer.replace(/\r\n/g,'\n').split('\n');let b=plugin.richText.text(lines[0]);
    for(const line of lines.slice(1))b=b.newline().text(line);
    return b.value();
  }
  const api={
    protectUntracked:!!options.protectUntracked,
    sourceAuthoritative:!!options.sourceAuthoritative,
    async assertRoot(){const r=await plugin.rem.findOne(rootId);if(!r||normalize(await plain(r.text))!==rootName)throw new Error('Open the knowledge base containing '+rootName+' before syncing.');cache.set(r._id,r);},
    async indexExisting(){
      const index=new Map<string,any[]>(), queue=[rootId],seen=new Set<string>();
      while(queue.length){const id=queue.shift()!;if(seen.has(id))continue;seen.add(id);if(seen.size>25000)throw new Error('Anatomy PYQ is larger than expected; sync stopped.');
        const r=cache.get(id)||await plugin.rem.findOne(id);if(!r)continue;cache.set(id,r);
        const value=await view(r), key=normalize(value.question).toLocaleLowerCase();
        if(id!==rootId&&key){const arr=index.get(key)||[];arr.push(value);index.set(key,arr);}
        queue.push(...(r.children||[]));
      }return index;
    },
    async getCard(id:string){const r=await plugin.rem.findOne(id);return r&&await inside(r)?view(r):null;},
    async getMapping(id:string){return plugin.storage.getSynced<any>(mappingKey(id));},
    async getTrackedMappings(){const v=await plugin.storage.getSynced<Record<string,string>>(trackedKey)||{};if(typeof v!=='object'||Array.isArray(v)||Object.entries(v).some(([id,remId])=>!/^g\d+$/.test(id)||typeof remId!=='string'||!/^[-A-Za-z0-9_]+$/.test(remId)))throw new Error('Saved card tracking is invalid. Existing cards were kept.');return v;},
    async trackMapping(id:string,remId:string){const v=await api.getTrackedMappings();if(v[id]===remId)return;if(v[id]&&v[id]!==remId)throw new Error('Saved card links disagree. Existing cards were kept.');await plugin.storage.setSynced(trackedKey,{...v,[id]:remId});},
    async saveMapping(id:string,value:any){await plugin.storage.setSynced(mappingKey(id),value);await api.trackMapping(id,value.remId);},
    async untrackMapping(id:string){const v=await api.getTrackedMappings();delete v[id];await plugin.storage.setSynced(trackedKey,v);},
    async trashCard(id:string){
      await beforeWrite();
      const r=await plugin.rem.findOne(id);
      if(!r||r._id===rootId||!await inside(r))throw new Error('Card is missing or outside Anatomy PYQ; it was kept.');
      if((r.children?.length&&!options.sourceAuthoritative)||await r.isDocument())throw new Error('Card contains added notes or is a document; it was kept for review.');
      await r.remove();
      const remains=await plugin.rem.findOne(id);
      if(remains&&await inside(remains))throw new Error('RemNote did not confirm removal. Allow delete access to Anatomy PYQ and retry.');
      cache.delete(id);
    },
    async ensureLecture(lecture:any,region:string){
      if(lectures.has(lecture.code))return lectures.get(lecture.code)!;
      async function group(key:string,title:string,parent:string,position:number){
        key=prefix+key;await beforeWrite();
        const old=await plugin.storage.getSynced<string>(key);let r=old?await plugin.rem.findOne(old):undefined;
        if(r&&!await inside(r))throw new Error('A mapped lecture was moved outside Anatomy PYQ.');
        if(!r)r=await plugin.rem.findByName([title],parent);
        if(!r){r=await plugin.rem.createRem();if(!r)throw new Error('RemNote could not create a lecture.');await r.setText([title]);await r.setParent(parent,position);await r.setIsDocument(true);}
        if(await plain(r.text)!==title)await r.setText([title]);
        await r.setParent(parent,position);
        await plugin.storage.setSynced(key,r._id);return r._id;
      }
      const regionId=await group(`pyq-region-v1:${region}`,region,rootId,REGIONS.indexOf(region));
      const lecturePosition=options.lecturePositions?.[lecture.code]??Math.max(0,(Number(lecture.code.match(/(\d+)$/)?.[1])||1)-1);
      const id=await group(`pyq-lecture-v1:${lecture.code}`,`${lecture.code} · ${lecture.title}`,regionId,lecturePosition);lectures.set(lecture.code,id);return id;
    },
    async createCard(id:string,target:any){
      await beforeWrite();
      // Popup widgets cannot reliably execute app.transaction callbacks. Await
      // each write directly and retain a recovery mapping before writing the back.
      const created=await plugin.rem.createRem();
      if(!created)throw new Error('RemNote could not create the card.');
      await created.setParent(target.parent);
      await created.setText([target.question]);
      await api.saveMapping(id,{remId:created._id,...target,answer:''});
      await created.setBackText(await richAnswer(target.answer));
      const saved=await api.getCard(created._id);
      if(!saved||normalize(saved.question)!==normalize(target.question)||saved.answer.trim()!==target.answer.trim())throw new Error('RemNote did not save the complete card. Retry sync to finish.');
      await api.saveMapping(id,{remId:created._id,...target});
      return saved;
    },
    async updateCard(id:string,target:any){await beforeWrite();const r=await plugin.rem.findOne(id);if(!r||!await inside(r))throw new Error('The target card is no longer inside Anatomy PYQ.');
      await r.setText([target.question]);
      await r.setBackText(await richAnswer(target.answer));
      if(r.parent!==target.parent)await r.setParent(target.parent);
      const saved=await api.getCard(id);
      if(!saved||normalize(saved.question)!==normalize(target.question)||saved.answer.trim()!==target.answer.trim())throw new Error('RemNote did not save the complete update. Retry sync to finish.');
    },
    async orderCards(rows:any[],bindings:any[]){const ids=new Map(bindings.map(b=>[b.sourceId,b.remId]));const positions=new Map<string,number>();for(const row of rows){const id=ids.get(row.sourceId);if(!id)continue;const r=await plugin.rem.findOne(id);if(!r||!await inside(r))continue;const pos=positions.get(r.parent!)||0;await beforeWrite();await r.setParent(r.parent!,pos);positions.set(r.parent!,pos+1);}}
  };return api;
}
