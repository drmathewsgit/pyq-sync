import * as esbuild from 'esbuild';
import {mkdir,copyFile,writeFile,rm} from 'node:fs/promises';
const dest='dist';await rm(dest,{recursive:true,force:true});await mkdir(dest,{recursive:true});
for(const widget of ['index','qbank_popup'])for(const sandbox of [false,true]){
 const name=widget+(sandbox?'-sandbox':'');
 await esbuild.build({entryPoints:['qbank-index.tsx'],bundle:true,outfile:`${dest}/${name}.js`,platform:'browser',format:'esm',minify:true,banner:sandbox?{}:{js:'const IMPORT_META=import.meta;'},define:{'process.env.NODE_ENV':'"production"','__PYQ_WIDGET__':JSON.stringify(widget)},loader:{'.css':'css'}});
}
await copyFile(`${dest}/qbank_popup.css`,`${dest}/App.css`);
await writeFile(`${dest}/snippet.css`,'/* AnaBodhi has no global styles. */');
await copyFile('manifest.json',`${dest}/manifest.json`);
await copyFile('README.md',`${dest}/README.md`);
await writeFile(`${dest}/index.html`,'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="App.css"><title>AnaBodhi</title></head><body><script type="module">const widget=new URLSearchParams(location.search).get("widgetName");if(["index","qbank_popup"].includes(widget)){const script=document.createElement("script");script.type="module";script.src=widget+"-sandbox.js";document.body.appendChild(script);}else{document.body.textContent="AnaBodhi — install through RemNote, then open the plugin and press Sync question bank.";}</script></body></html>');
console.log('Built AnaBodhi hosted package for teachers and students.');
