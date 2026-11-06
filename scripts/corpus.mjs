import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { encode } from '../src/encoder.js';
import { ShadowImageDecoder } from '../src/decoder.js';
import { predictiveBaseline } from '../experiments/predictive.js';

const sourceRoot=process.argv[2] || process.env.SHADOW_IMAGE_CORPUS_ROOT;
if(!sourceRoot)throw Error('Usage: npm run corpus -- <read-only image corpus directory>');
const out='experiments/generated';await fs.mkdir(out,{recursive:true});
const chosen=JSON.parse(await fs.readFile('experiments/corpus.json')).map(item=>({...item,source:path.join(sourceRoot,item.source)}));
const report=[];
for(let index=0;index<chosen.length;index++){
 const item=chosen[index],id=item.id;
 const original=await fs.readFile(item.source), metadata=await sharp(original).metadata();
 assert.equal(createHash('sha256').update(original).digest('hex'),item.sha256,'Source changed since corpus selection');
 const {data,info}=await sharp(original).rotate().toColourspace('srgb').resize({width:768,height:768,fit:'inside',withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const rgba=new Uint8Array(data),{width,height}=info;
 await sharp(data,{raw:{width,height,channels:4}}).png().toFile(`${out}/${id}.png`);
 const runs=[];
 for(const baseSize of [16,32,64]){
   const start=performance.now(),bytes=encode(rgba,{width,height,baseSize});const encodeMs=performance.now()-start;
   const frames=[];let final;const decodeStart=performance.now();
   const decoder=new ShadowImageDecoder({onFrame:f=>{frames.push({level:f.level,plane:f.plane,bytes:f.bytes,width:f.width,height:f.height,elapsedMs:performance.now()-decodeStart});final=f;}});
   for(let p=0;p<bytes.length;p+=4093)decoder.push(bytes.subarray(p,p+4093));decoder.finish();
   assert.deepEqual(final.rgba,new Uint8ClampedArray(rgba));
   const baseline=predictiveBaseline(rgba,width,height,baseSize);
   const modes={varint:0,zeroRun:0,rice:0,zeroRunRice:0};let varintEquivalent=24;
   const {decodeBlock}=await import('../src/codec/entropy.js');
   for(let p=24;p<bytes.length;){const v=new DataView(bytes.buffer,p),n=v.getUint32(0),count=v.getUint16(16);varintEquivalent+=24;if(n){const mode=bytes[p+24];modes[mode===0?'varint':mode===1?'zeroRun':mode>=32?'zeroRunRice':'rice']++;for(const value of decodeBlock(bytes.subarray(p+24,p+24+n),count)){let z=value<0?-2*value-1:2*value;do{varintEquivalent++;z=Math.floor(z/128);}while(z);}varintEquivalent++;}p+=24+n;}
   runs.push({baseSize,bytes:bytes.length,firstBytes:frames[0].bytes,checkpoints:frames.length,encodeMs,decodeMs:performance.now()-decodeStart,frames,modes,varintEquivalent,baseline:{bytes:baseline.bytes,firstBytes:baseline.firstBytes,checkpoints:baseline.checkpoints,note:'RGB predictive baseline; alpha excluded'}});
   // Base previews at target size for visual comparison.
   let first;const preview=new ShadowImageDecoder({onFrame:f=>{first??=f;},frameIntervalMs:1e12});preview.push(bytes);preview.finish();
   await sharp(first.rgba,{raw:{width:first.width,height:first.height,channels:4}}).resize(width,height,{kernel:'linear'}).png().toFile(`${out}/${id}-base${baseSize}.png`);
   if(baseSize===32){
     await fs.writeFile(`${out}/${id}.shp`,bytes);
     const selected=new Set([0,Math.floor(frames.length/3),Math.floor(frames.length*2/3),frames.length-1]);let ordinal=0;const writes=[];
     const d=new ShadowImageDecoder({onFrame:f=>{if(selected.has(ordinal)){const stage=ordinal;writes.push(sharp(f.rgba,{raw:{width:f.width,height:f.height,channels:4}}).resize(width,height,{kernel:'linear'}).png().toFile(`${out}/${id}-stage${stage}.png`));}ordinal++;}});d.push(bytes);d.finish();await Promise.all(writes);
     const lossy=encode(rgba,{width,height,baseSize,omitBits:2});await fs.writeFile(`${out}/${id}-lossy.shp`,lossy);
     let last;const ld=new ShadowImageDecoder({onFrame:f=>last=f,frameIntervalMs:1e12});ld.push(lossy);ld.finish();for(let p=3;p<rgba.length;p+=4)assert.equal(last.rgba[p],rgba[p]);
   }
 }
 report.push({id,category:item.category,source:path.relative(sourceRoot,item.source).split(path.sep).join('/'),sha256:createHash('sha256').update(original).digest('hex'),sourceBytes:original.length,sourceWidth:metadata.width,sourceHeight:metadata.height,width,height,hasTransparency:rgba.some((v,i)=>i%4===3&&v!==255),rgbaSha256:createHash('sha256').update(rgba).digest('hex'),runs});
 console.log(id,width,height,runs.map(r=>`${r.baseSize}:${r.bytes}B/${r.firstBytes}B first`).join(' '));
 await fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
}
await fs.writeFile(`${out}/manifest.json`,JSON.stringify(report.map(({runs,...r})=>r),null,2));
await fs.mkdir('reports',{recursive:true});
await fs.writeFile('reports/corpus-results.json',JSON.stringify(report,null,2));
