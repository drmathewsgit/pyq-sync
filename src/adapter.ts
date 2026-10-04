import type {RNPlugin} from '@remnote/plugin-sdk';
import type {RemObject} from '@remnote/plugin-sdk/dist/name_spaces/rem';
import {ROOT_ID, REGIONS, normalize} from './core.mjs';
export function makeAdapter(plugin: RNPlugin) {
  const cache=new Map<string,RemObject>();
  const lectures=new Map<string,string>();
  const plain=(t:any) => plugin.richText.toString(t || []);
  const mappingKey=(id:string) => `pyq-card-v1:${id}`;
  async function inside(rem:RemObject) {
    let r:RemObject|undefined=rem;
    for(let n=0;r&&n<30;n++) {if(r._id===ROOT_ID)return true;r=r.parent ? await plugin.rem.findOne(r.parent):undefined;}
    return false;
  }
  async function view(r:RemObject) {return {id:r._id,question:await plain(r.text),answer:await plain(r.backText),parent:r.parent};}
  async function richAnswer(answer:string) {
    const lines=answer.replace(/\r\n/g,'\n').split('\n');let b=plugin.richText.text(lines[0]);
    for(const line of lines.slice(1))b=b.newline().text(line);
    return b.value();
  }
  const api={
    async assertRoot(){const r=await plugin.rem.findOne(ROOT_ID);if(!r||normalize(await plain(r.text))!=='Anatomy PYQ')throw new Error('Open the knowledge base containing Anatomy PYQ before syncing.');cache.set(r._id,r);},
    async indexExisting(){
      const index=new Map<string,any[]>(), queue=[ROOT_ID],seen=new Set<string>();
      while(queue.length){const id=queue.shift()!;if(seen.has(id))continue;seen.add(id);if(seen.size>25000)throw new Error('Anatomy PYQ is larger than expected; sync stopped.');
        const r=cache.get(id)||await plugin.rem.findOne(id);if(!r)continue;cache.set(id,r);
        const value=await view(r), key=normalize(value.question).toLocaleLowerCase();
        if(id!==ROOT_ID&&key){const arr=index.get(key)||[];arr.push(value);index.set(key,arr);}
        queue.push(...(r.children||[]));
      }return index;
    },
    async getCard(id:string){const r=await plugin.rem.findOne(id);return r&&await inside(r)?view(r):null;},
    async getMapping(id:string){return plugin.storage.getSynced<any>(mappingKey(id));},
    async saveMapping(id:string,value:any){await plugin.storage.setSynced(mappingKey(id),value);},
    async ensureLecture(lecture:any,region:string){
      if(lectures.has(lecture.code))return lectures.get(lecture.code)!;
      async function group(key:string,title:string,parent:string,position:number){
        const old=await plugin.storage.getSynced<string>(key);let r=old?await plugin.rem.findOne(old):undefined;
        if(r&&!await inside(r))throw new Error('A mapped lecture was moved outside Anatomy PYQ.');
        if(!r)r=await plugin.rem.findByName([title],parent);
        if(!r){r=await plugin.rem.createRem();if(!r)throw new Error('RemNote could not create a lecture.');await r.setText([title]);await r.setParent(parent,position);await r.setIsDocument(true);}
        if(await plain(r.text)!==title)await r.setText([title]);
        await r.setParent(parent,position);
        await plugin.storage.setSynced(key,r._id);return r._id;
      }
      const regionId=await group(`pyq-region-v1:${region}`,region,ROOT_ID,REGIONS.indexOf(region));
      const lecturePosition=Math.max(0,(Number(lecture.code.match(/(\d+)$/)?.[1])||1)-1);
      const id=await group(`pyq-lecture-v1:${lecture.code}`,`${lecture.code} · ${lecture.title}`,regionId,lecturePosition);lectures.set(lecture.code,id);return id;
    },
    async createCard(id:string,target:any){
      let created:RemObject|undefined;
      await plugin.app.transaction(async()=>{
        created=await plugin.rem.createRem();if(!created)throw new Error('RemNote could not create the card.');
        await created.setParent(target.parent);await created.setText([target.question]);await created.setBackText(await richAnswer(target.answer));
        await api.saveMapping(id,{remId:created._id,...target});
      });return {id:created!._id,...target};
    },
    async updateCard(id:string,target:any){const r=await plugin.rem.findOne(id);if(!r||!await inside(r))throw new Error('The target card is no longer inside Anatomy PYQ.');
      await plugin.app.transaction(async()=>{await r.setText([target.question]);await r.setBackText(await richAnswer(target.answer));if(r.parent!==target.parent)await r.setParent(target.parent);});
    },
    async orderCards(rows:any[],bindings:any[]){const ids=new Map(bindings.map(b=>[b.sourceId,b.remId]));const positions=new Map<string,number>();for(const row of rows){const id=ids.get(row.sourceId);if(!id)continue;const r=await plugin.rem.findOne(id);if(!r||!await inside(r))continue;const pos=positions.get(r.parent!)||0;await r.setParent(r.parent!,pos);positions.set(r.parent!,pos+1);}}
  };return api;
}
