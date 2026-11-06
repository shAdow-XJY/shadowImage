import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encode,Decoder} from './codec.js';
import {gzipSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
test('lossless reconstruction with arbitrary chunk boundaries',()=>{
 for(const [w,h] of [[1,1],[17,9],[80,45],[640,360]]){
  const rgb=Uint8Array.from({length:w*h*3},(_,i)=>(i*73+(i>>>4))&255), data=encode(rgb,w,h);
  for(const size of [1,7,65536]){let last,count=0;const d=new Decoder(e=>{last=e.rgb;count++;});for(let p=0;p<data.length;p+=size)d.push(data.subarray(p,p+size));d.finish();assert.deepEqual(last,rgb);assert.ok(count>0);}
 }
});
test('reject malformed and truncated inputs',()=>{
 assert.throws(()=>new Decoder().push(Uint8Array.of(0,0,0,0,0,1,0,1)));
 const data=encode(new Uint8Array(17*9*3),17,9),d=new Decoder();d.push(data.subarray(0,-1));assert.throws(()=>d.finish());
 const done=new Decoder();done.push(data);assert.throws(()=>done.push(Uint8Array.of(0)));
});
test('report synthetic size baseline',()=>{
 const w=640,h=360,rgb=Uint8Array.from({length:w*h*3},(_,i)=>{const p=Math.floor(i/3);return i%3===0?Math.floor(p%w/w*255):i%3===1?Math.floor(Math.floor(p/w)/h*255):180;});
 const data=encode(rgb,w,h);let first;const d=new Decoder(e=>{first??=e.bytes;});d.push(data);d.finish();
 console.log(JSON.stringify({fixture:'synthetic gradient; not a photo benchmark',rawRGB:rgb.length,encoded:data.length,firstLevelBytes:first,codecJS:readFileSync(new URL('./codec.js',import.meta.url)).length,codecGzip:gzipSync(readFileSync(new URL('./codec.js',import.meta.url))).length}));
});
