import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConnection,requestConnection,ENDPOINT} from '../upload-src/connection.mjs';
import {SHEET_ID,ROOT_ID} from '../src/core.mjs';
const config={schema:'pyq-sync-connection-v1',endpoint:ENDPOINT,spreadsheetId:SHEET_ID,rootId:ROOT_ID,token:'test-only-token'.repeat(4)};
test('connection cannot redirect a private key to another host or sheet',()=>{
 for(const bad of [{endpoint:'https://example.com'},{spreadsheetId:'other'},{rootId:'other'},{token:''}])assert.throws(()=>validateConnection({...config,...bad}));
});
test('browser connector uses a simple POST and keeps key out of URL',async()=>{
 let observed;
 const r=await requestConnection(config,'snapshot',{},async(url,options)=>{observed={url,options};return {ok:true,json:async()=>({ok:true})}});
 assert.equal(r.ok,true);assert.equal(observed.url,ENDPOINT);assert.match(observed.options.headers['Content-Type'],/^text\/plain/);assert.equal(observed.options.credentials,'omit');assert.equal(observed.options.redirect,'follow');assert.equal(JSON.parse(observed.options.body).token,config.token);
});
test('auth rejection and unsupported action never report success',async()=>{
 await assert.rejects(()=>requestConnection(config,'snapshot',{},async()=>({ok:true,json:async()=>({ok:false,error:'Unauthorized'})})),/key was rejected/);
 await assert.rejects(()=>requestConnection(config,'delete'),/Unsupported/);
});
