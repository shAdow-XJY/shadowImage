import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShadowImagePlayer } from '../src/player.js';
import { encode } from '../src/encoder.js';
const context=()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},clearRect(){},drawImage(){}});
const canvas=()=>({width:0,height:0,getContext:()=>context(),ownerDocument:{createElement:()=>({getContext:()=>context()})}});
const bytes=encode(new Uint8Array(65*37*4).fill(255),{width:65,height:37});
test('player consumes streams, emits final and releases reader',async()=>{
 let i=0;const stream=new ReadableStream({pull(c){if(i===bytes.length)c.close();else{c.enqueue(bytes.slice(i,i+97));i=Math.min(i+97,bytes.length);}}});
 const events=[],player=new ShadowImagePlayer({canvas:canvas(),stream,execution:'main',onProgress:e=>events.push(e)});
 assert.equal((await player.start()).status,'complete');assert.equal(stream.locked,false);assert.ok(events.some(e=>e.stage==='frame'&&e.final));player.destroy();await assert.rejects(player.start(),/destroyed/);
});
test('stop cancels a pending read and restart isolates stale session',async()=>{
 let cancelled=false;const stream=new ReadableStream({cancel(){cancelled=true;}}),events=[];
 const player=new ShadowImagePlayer({canvas:canvas(),execution:'main',onProgress:e=>events.push(e)});
 const old=player.start(stream);player.stop();const fresh=player.start(bytes);
 assert.equal((await old).status,'stopped');assert.equal((await fresh).status,'complete');assert.ok(cancelled);assert.equal(stream.locked,false);assert.equal(events.filter(e=>e.stage==='complete').length,1);
});
test('truncation reports failure and retains last valid frame',async()=>{
 let drawn=0,error;const player=new ShadowImagePlayer({canvas:canvas(),execution:'main',onFrame:()=>drawn++,onError:e=>error=e});
 await assert.rejects(player.start(bytes.subarray(0,bytes.length-1)),/Incomplete/);assert.ok(drawn);assert.ok(error);assert.equal(player.state,'error');
});
test('fetch fallback is explicitly non-progressive and respects limits',async()=>{
 const original=globalThis.fetch,events=[];globalThis.fetch=async()=>({ok:true,headers:new Headers(),body:null,arrayBuffer:async()=>bytes.buffer});
 try{
  const player=new ShadowImagePlayer({canvas:canvas(),url:'/test',execution:'main',onProgress:e=>events.push(e)});assert.equal((await player.start()).status,'complete');
  assert.ok(events.some(e=>e.stage==='fallback'&&e.progressive===false));
  await assert.rejects(new ShadowImagePlayer({canvas:canvas(),url:'/test',execution:'main',maxStreamBytes:10}).start(),/byte limit/);
 }finally{globalThis.fetch=original;}
});
