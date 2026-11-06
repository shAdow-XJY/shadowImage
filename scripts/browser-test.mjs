import { chromium, firefox, webkit } from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from '../demo/progressive-server.mjs';
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
await fs.mkdir('experiments/generated/browser',{recursive:true});const results=[];
const targets=[
 ['chromium',chromium,{}],
 ['firefox',firefox,{}],
 ['webkit',webkit,{}],
 ['edge',chromium,{channel:'msedge'}],['chrome',chromium,{channel:'chrome'}],
];
try{for(const [name,type,options] of targets){
 let browser;try{browser=await type.launch({headless:true,timeout:15000,...options});}catch(error){results.push({browser:name,status:'unavailable',reason:error.message});console.log(name,error.message.slice(0,900));await fs.writeFile('reports/browser-results.json',JSON.stringify(results,null,2));continue;}
 try{
  const context=await browser.newContext({viewport:{width:1200,height:900}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>document.querySelector('#sample').options.length===12);
  await page.evaluate(()=>{window.longTasks=[];window.longTasksSupported=PerformanceObserver.supportedEntryTypes.includes('longtask');if(window.longTasksSupported)new PerformanceObserver(list=>window.longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true});});
  await page.selectOption('#sample','02-text-card');await page.selectOption('#rate','256');await page.click('#start');
  await page.waitForFunction(()=>window.shadowEvents.some(e=>e.stage==='frame'),{},{timeout:30000});await page.screenshot({path:`experiments/generated/browser/${name}-first.png`});
  for(const n of [4,8]){await page.waitForFunction(n=>window.shadowEvents.filter(e=>e.stage==='frame').length>=n,n,{timeout:90000});await page.screenshot({path:`experiments/generated/browser/${name}-stage${n}.png`});}
  await page.waitForFunction(()=>window.shadowResult?.status==='complete',{},{timeout:90000});
  await page.screenshot({path:`experiments/generated/browser/${name}-final.png`});
  const result=await page.evaluate(()=>({result:window.shadowResult,events:window.shadowEvents,longTasksSupported:window.longTasksSupported,longTasks:window.longTasks,memory:performance.memory?{usedJSHeapSize:performance.memory.usedJSHeapSize}:null}));
  const frames=result.events.filter(e=>e.stage==='frame');assert.ok(frames.length>=4);assert.ok(frames[0].bytes<result.result.bytes);assert.ok(frames[0].elapsedMs<result.result.elapsedMs);assert.ok(result.events.some(e=>e.stage==='execution'));
  // Main-thread path, transparent pixels, stop and restart on a throttled real response.
  await page.selectOption('#sample','04-transparent-interface');await page.selectOption('#execution','main');await page.click('#start');
  await page.waitForFunction(()=>window.shadowEvents.some(e=>e.stage==='frame'));await page.click('#stop');await page.waitForFunction(()=>window.shadowPlayer.state==='stopped');
  await page.selectOption('#sample','02-text-card');await page.click('#start');await page.waitForFunction(()=>window.shadowEvents.some(e=>e.stage==='complete'),{},{timeout:90000});
  const main=await page.evaluate(()=>({result:window.shadowResult,events:window.shadowEvents}));
  // Worker startup failure must select main thread and still decode correctly.
  const fallback=await page.evaluate(async()=>{
   const {ShadowImagePlayer}=await import('/dist/index.js'),events=[];
   const p=new ShadowImagePlayer({canvas:document.createElement('canvas'),workerUrl:'/missing-worker.js',onProgress:e=>events.push(e)});
   const result=await p.start('/experiments/generated/02-text-card.shp');p.destroy();return {result,events};
  });assert.ok(fallback.events.some(e=>e.stage==='fallback'&&e.reason==='worker-unavailable'));
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:`experiments/generated/browser/${name}-mobile-layout.png`});
  assert.deepEqual(errors,[]);results.push({browser:name,version:browser.version(),status:'passed',frames:frames.length,first:frames[0],result:result.result,main:main.result,longTasksSupported:result.longTasksSupported,longTasks:result.longTasks,memory:result.memory,note:'Desktop engine; mobile viewport is not a physical device test'});
 }catch(error){results.push({browser:name,status:'failed',reason:error.stack});}finally{await browser.close();}
 await fs.writeFile('reports/browser-results.json',JSON.stringify(results,null,2));console.log(results.at(-1));
}}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
await fs.writeFile('reports/browser-results.json',JSON.stringify(results,null,2));
if(results.some(r=>r.status==='failed'))process.exitCode=1;
