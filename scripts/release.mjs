import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';
import { encode } from '../src/encoder.js';
import { samplePixels } from './sample.mjs';

const pkg=JSON.parse(await fs.readFile('package.json','utf8')),version=pkg.version;
if(!process.env.npm_execpath)throw Error('Run with npm run release');
await import('./build.mjs');await fs.mkdir('release',{recursive:true});
const packed=JSON.parse(execFileSync(process.execPath,[process.env.npm_execpath,'pack','--json','--ignore-scripts','--pack-destination','release'],{encoding:'utf8'}))[0];
const root=`shadow-image-${version}`,files={},mtime=new Date('2026-01-01T00:00:00Z');
for(const name of ['dist/index.js','dist/index.d.ts','dist/encoder.js','dist/encoder.d.ts','dist/player/worker.js','dist/sizes.json','README.md','LICENSE','specs/SHP2.md','docs/DEVELOPMENT.md',`docs/releases/v${version}.md`,'reports/VALIDATION.md'])files[`${root}/${name}`]=[new Uint8Array(await fs.readFile(name)),{mtime}];
files[`${root}/index.html`]=[new Uint8Array(await fs.readFile('examples/browser.html')),{mtime}];
const {rgba,width,height}=samplePixels();files[`${root}/sample.shp`]=[encode(rgba,{width,height}),{mtime}];
const archive=`shadow-image-browser-${version}.zip`;
await fs.writeFile(`release/${archive}`,zipSync(files,{level:9}));
const artifacts=[packed.filename,archive],checks=[];
for(const file of artifacts){const bytes=await fs.readFile(`release/${file}`);checks.push(`${createHash('sha256').update(bytes).digest('hex')}  ${file}`);console.log(`${file}: ${bytes.length} bytes`);}
await fs.writeFile('release/SHA256SUMS',checks.join('\n')+'\n');
await fs.copyFile(`docs/releases/v${version}.md`,'release/RELEASE_NOTES.md');
