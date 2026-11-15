import {build as viteBuild} from 'vite';
import {build as esbuild} from 'esbuild';
import {readdir,readFile,writeFile,mkdir,copyFile,rm} from 'node:fs/promises';
await viteBuild({build:{outDir:'dist/client',emptyOutDir:true}});
const assets={};
async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true})){const p=`${dir}/${item.name}`;if(item.isDirectory())await walk(p);else{const key=p.replace('dist/client','');const type=p.endsWith('.js')?'text/javascript; charset=utf-8':p.endsWith('.css')?'text/css; charset=utf-8':p.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8';assets[key]={type,body:await readFile(p,'utf8')};}}}
await walk('dist/client');await writeFile('server/generated-assets.js',`export const ASSETS=${JSON.stringify(assets)};`);
await mkdir('dist/server',{recursive:true});await esbuild({entryPoints:['server/worker.js'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
await rm('server/generated-assets.js');await mkdir('dist/.openai',{recursive:true});await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Built React frontend, Express-ready assets, and Sites Worker adapter.');
