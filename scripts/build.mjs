import { build } from 'esbuild';
import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
await mkdir('dist', { recursive: true });
await copyFile('src/index.d.ts','dist/index.d.ts');await copyFile('src/encoder.d.ts','dist/encoder.d.ts');
for (const [entry, outfile] of [['src/index.js','dist/index.js'], ['src/player/worker.js','dist/player/worker.js'], ['src/encoder.js','dist/encoder.js']]) {
  await build({ entryPoints:[entry], outfile, bundle:true, minify:true, format:'esm', target:'es2020' });
}
const sizes = {};
for (const file of ['dist/index.js','dist/player/worker.js','dist/encoder.js']) { const bytes=await readFile(file); sizes[file]={bytes:bytes.length,gzip:gzipSync(bytes).length}; }
sizes.runtimeGzip = sizes['dist/index.js'].gzip + sizes['dist/player/worker.js'].gzip;
await writeFile('dist/sizes.json',JSON.stringify(sizes,null,2)); console.log(sizes);
if (sizes.runtimeGzip>20*1024) throw Error('Runtime gzip budget exceeded');
