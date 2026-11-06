import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from '../demo/progressive-server.mjs';
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const results=await page.evaluate(async()=>{
  const {ShadowImagePlayer}=await import('/dist/index.js'),samples=await(await fetch('/experiments/generated/manifest.json')).json(),results=[];
  for(const sample of samples)for(const execution of ['main','auto']){
   const events=[];let final,peakMainHeap=0;const sampleHeap=()=>{peakMainHeap=Math.max(peakMainHeap,performance.memory?.usedJSHeapSize??0);};sampleHeap();const heapTimer=setInterval(sampleHeap,8);
   const player=new ShadowImagePlayer({canvas:document.createElement('canvas'),execution,onProgress:e=>{if(e.stage==='frame')events.push(e);},onFrame:f=>{if(f.final)final=f.rgba;}});
   const result=await player.start(`/experiments/generated/${sample.id}.shp`);
   const digest=await crypto.subtle.digest('SHA-256',final),hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
   sampleHeap();clearInterval(heapTimer);results.push({id:sample.id,execution,hash,expected:sample.rgbaSha256,result,frames:events.length,first:events[0],sampledMainHeapPeak:peakMainHeap||null,memory:performance.memory?.usedJSHeapSize??null});player.destroy();
  }return results;
 });
 for(const r of results)assert.equal(r.hash,r.expected,`${r.id} ${r.execution}`);
 await fs.writeFile('reports/browser-corpus.json',JSON.stringify(results,null,2));console.log('Browser pixel hashes passed:',results.length);
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
