import * as esbuild from 'esbuild';
import {mkdir,writeFile,copyFile,readFile} from 'node:fs/promises';
const sourceManifest=JSON.parse(await readFile('manifest.json','utf8'));
const repoUrl=(process.env.PYQ_PUBLIC_REPO_URL||sourceManifest.repoUrl)?.trim();
if(!repoUrl||!/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+\/?$/.test(repoUrl)){
 throw new Error('A real public GitHub source repository is required. Set PYQ_PUBLIC_REPO_URL to https://github.com/OWNER/REPOSITORY before building.');
}
const dest='upload-dist';await mkdir(dest,{recursive:true});
for(const widget of ['index','pyq_popup'])for(const sandbox of [false,true]){
 const name=widget+(sandbox?'-sandbox':'');
 await esbuild.build({entryPoints:['upload-src/index.tsx'],bundle:true,outfile:`${dest}/${name}.js`,platform:'browser',format:'esm',minify:true,banner:sandbox?{}:{js:'const IMPORT_META=import.meta;'},define:{'process.env.NODE_ENV':'"production"','__PYQ_WIDGET__':JSON.stringify(widget)},loader:{'.css':'css'}});
}
await copyFile(`${dest}/pyq_popup.css`,`${dest}/App.css`);
await writeFile(`${dest}/snippet.css`,'/* PYQ Sync has no global RemNote styles. */');
await writeFile(`${dest}/index.html`,'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="App.css"><title>PYQ Sync</title></head><body><script type="module">const widget=new URLSearchParams(location.search).get("widgetName");if(["index","pyq_popup"].includes(widget)){const script=document.createElement("script");script.type="module";script.src=widget+"-sandbox.js";document.body.appendChild(script);}else{document.body.textContent="Open PYQ Sync from the RemNote sidebar.";}</script></body></html>');
const manifest={...sourceManifest,repoUrl};
await writeFile(`${dest}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
await copyFile('README.md',`${dest}/README.md`);
console.log('Built upload-dist for the configured GitHub repository. RemNote review is still required.');
