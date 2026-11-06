import { chromium, webkit } from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from '../demo/progressive-server.mjs';
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const results=[];
try{for(const [name,type,options] of [['chromium',chromium,{}],['edge',chromium,{channel:'msedge'}],['webkit',webkit,{}]]){
 const browser=await type.launch({headless:true,...options});try{
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/demo/cold.html`);
  const result=await page.evaluate(async()=>{
   const start=performance.now();const {ShadowImagePlayer}=await import('/dist/index.js');let first;
   const player=new ShadowImagePlayer({canvas:document.querySelector('canvas'),onProgress:e=>{if(e.stage==='frame')first??={...e,fromImportStartMs:performance.now()-start};}});
   const completed=await player.start('/experiments/generated/02-text-card.shp?rate=256');player.destroy();
   return {first,completed,elapsedFromImportMs:performance.now()-start,runtimeResources:performance.getEntriesByType('resource').filter(e=>e.name.includes('/dist/')).map(e=>({name:e.name.split('/dist/')[1],duration:e.duration,transferSize:e.transferSize,decodedBodySize:e.decodedBodySize}))};
  });assert.ok(result.first.fromImportStartMs<result.elapsedFromImportMs);results.push({browser:name,version:browser.version(),...result});
 }finally{await browser.close();}
}}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
await fs.writeFile('reports/cold-start.json',JSON.stringify(results,null,2));console.log(results.map(r=>({browser:r.browser,first:r.first.fromImportStartMs,full:r.elapsedFromImportMs})));
