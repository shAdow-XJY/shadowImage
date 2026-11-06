import fs from 'node:fs/promises';
import sharp from 'sharp';
import { encode } from '../src/encoder.js';
const [input,output,...args]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: node scripts/encode.mjs input.png output.shp [--base=32] [--omit=0]');
const baseSize=Number(args.find(x=>x.startsWith('--base='))?.split('=')[1]??32),omitBits=Number(args.find(x=>x.startsWith('--omit='))?.split('=')[1]??0);
const {data,info}=await sharp(input).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
const encoded=encode(new Uint8Array(data),{width:info.width,height:info.height,baseSize,omitBits});
await fs.writeFile(output,encoded);console.log(`${info.width}x${info.height}, ${encoded.length} bytes`);
