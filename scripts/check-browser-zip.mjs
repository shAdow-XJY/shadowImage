import fs from 'node:fs/promises';
import http from 'node:http';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { chromium } from '@playwright/test';
const {version}=JSON.parse(await fs.readFile('package.json'));
const files=unzipSync(await fs.readFile(`release/shadow-image-browser-${version}.zip`));
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=files[`shadow-image-${version}/${pathname==='/'?'index.html':pathname.slice(1)}`];
  if(!file){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',pathname.endsWith('.js')?'text/javascript':pathname==='/'?'text/html; charset=utf-8':'application/octet-stream');res.end(file);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage();page.setDefaultTimeout(20000);
  const errors=[];let workers=0;page.on('pageerror',e=>errors.push(e.message));page.on('worker',()=>workers++);
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('final'));
  assert.deepEqual(errors,[]);assert.equal(workers,1);
  console.log('Browser ZIP example loaded its worker and rendered final pixels without page errors.');
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
