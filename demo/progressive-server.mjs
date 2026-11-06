import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.shp':'application/x-shadowimage'};
export function createServer(){return http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost'),relative=url.pathname==='/'?'demo/progressive.html':decodeURIComponent(url.pathname).replace(/^\/+/,''),file=path.resolve(root,relative);
  const normalized=path.relative(root,file).split(path.sep).join('/');
  if(!file.startsWith(root+path.sep)||!['demo','src','dist','experiments/generated'].some(prefix=>normalized.startsWith(prefix+'/'))){res.writeHead(403).end();return;}
  const stat=await fsp.stat(file);if(!stat.isFile())throw Error('Not file');
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.setHeader('Content-Length',stat.size);res.setHeader('Cache-Control',url.searchParams.has('rate')?'no-store':'public, max-age=60');
  const rate=Math.min(4096,Math.max(8,Number(url.searchParams.get('rate'))||0))*1024;
  if(path.extname(file)!=='.shp'||!url.searchParams.has('rate')){const input=fs.createReadStream(file);res.on('close',()=>input.destroy());input.on('error',()=>res.destroy());input.pipe(res);return;}
  res.flushHeaders();const input=fs.createReadStream(file,{highWaterMark:Math.max(256,Math.floor(rate/20))});
  let timer;res.on('close',()=>{clearTimeout(timer);input.destroy();});
  for await(const chunk of input){
    if(res.destroyed)break;
    await new Promise(resolve=>{const done=()=>{clearTimeout(timer);res.off('close',done);resolve();};timer=setTimeout(done,50);res.once('close',done);});
    if(res.destroyed)break;
    if(!res.write(chunk))await new Promise(resolve=>{const done=()=>{res.off('drain',done);res.off('close',done);resolve();};res.once('drain',done);res.once('close',done);});
  }
  if(!res.destroyed)res.end();
 }catch(error){if(!res.headersSent)res.writeHead(404);res.end();}
});}
if(process.argv[1]===fileURLToPath(import.meta.url)){const server=createServer();server.listen(Number(process.env.PORT)||8081,'127.0.0.1',()=>console.log(`ShadowImage demo: http://127.0.0.1:${server.address().port}`));}
