import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { encode } from '../src/encoder.js';

// Original procedural test artwork. No third-party images are distributed.
export function samplePixels(width = 480, height = 300) {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const nx=x/width, ny=y/height, i=(y*width+x)*4;
    let color=[35+90*ny,70+115*ny,120+105*ny];
    if (Math.hypot(nx-.72,(ny-.28)*height/width)<.065) color=[255,218,130];
    if (ny>.56+.08*Math.sin(nx*11)) color=[58,99,116];
    if (ny>.71+.09*Math.sin(nx*14+1)) color=[26,64,77];
    if (ny>.86+.04*Math.sin(nx*18)) color=[14,39,48];
    rgba[i]=color[0];rgba[i+1]=color[1];rgba[i+2]=color[2];rgba[i+3]=255;
  }
  return { rgba, width, height };
}

export async function prepareDemo() {
  const root='experiments/generated';await fs.mkdir(root,{recursive:true});
  try { await fs.access(`${root}/manifest.json`); console.log('Existing demo corpus retained.'); return; } catch {}
  const {default:sharp}=await import('sharp'),{rgba,width,height}=samplePixels();
  await fs.writeFile(`${root}/sample.shp`,encode(rgba,{width,height}));
  await fs.writeFile(`${root}/sample-lossy.shp`,encode(rgba,{width,height,omitBits:2}));
  await sharp(rgba,{raw:{width,height,channels:4}}).png().toFile(`${root}/sample.png`);
  await fs.writeFile(`${root}/manifest.json`,JSON.stringify([{id:'sample',category:'procedural-landscape',width,height}],null,2));
  console.log('Prepared original procedural demo sample.');
}
if(process.argv[1]===fileURLToPath(import.meta.url))await prepareDemo();
