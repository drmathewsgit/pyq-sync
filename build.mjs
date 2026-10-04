import * as esbuild from 'esbuild';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
for(const widget of ['index','pyq_popup'])for(const sandbox of [false,true]){
  const name=widget+(sandbox?'-sandbox':'');
  await esbuild.build({entryPoints:['src/index.tsx'],bundle:true,outfile:`dist/${name}.js`,platform:'browser',format:'esm',minify:true,banner:sandbox?{}:{js:'const IMPORT_META=import.meta;'},define:{'process.env.NODE_ENV':'"production"','__PYQ_WIDGET__':JSON.stringify(widget)},loader:{'.css':'css'}});
}
await copyFile('dist/pyq_popup.css','dist/App.css');
await writeFile('dist/snippet.css','/* PYQ Sync has no global RemNote styles. */');
await writeFile('dist/index.html','<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="App.css"><title>PYQ Sync</title></head><body><script type="module">const widget=new URLSearchParams(location.search).get("widgetName");if(["index","pyq_popup"].includes(widget)){const script=document.createElement("script");script.type="module";script.src=widget+"-sandbox.js";document.body.appendChild(script);}else{document.body.textContent="Open PYQ Sync from the RemNote sidebar.";}</script></body></html>');
await copyFile('manifest.json','dist/manifest.json');
console.log('PYQ Sync built.');
