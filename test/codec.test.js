import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode } from '../src/encoder.js';
import { ShadowImageDecoder } from '../src/decoder.js';
import { encodeBlock, decodeBlock } from '../src/codec/entropy.js';
import { seal } from '../src/codec/format.js';

const samples = (w, h, c) => Uint8Array.from({ length: w * h * c }, (_, i) => (Math.imul(i + 17, 1664525) >>> 9) & 255);
test('RGB/RGBA integer lifting is exact with odd, narrow and random sizes and arbitrary chunks', () => {
  for (const [width, height] of [[1, 1], [1, 79], [83, 1], [17, 19], [65, 37], [128, 129]]) for (const channels of [3, 4]) {
    const pixels = samples(width, height, channels);
    for (const baseSize of [16, 32, 64]) {
      const bytes = encode(pixels, { width, height, channels, baseSize }); let final, frames = 0;
      const decoder = new ShadowImageDecoder({ onFrame: f => { final = f; frames++; } });
      for (let p = 0; p < bytes.length;) { const n = p % 117 + 1; decoder.push(bytes.subarray(p, p + n)); p += n; }
      decoder.finish(); assert.equal(final.final, true); assert.ok(frames);
      for (let p = 0; p < width * height; p++) for (let c = 0; c < 4; c++) assert.equal(final.rgba[p * 4 + c], c < channels ? pixels[p * channels + c] : 255);
    }
  }
});
test('lossy refinement preserves exact alpha', () => {
  const pixels = samples(65, 63, 4); let final;
  const decoder = new ShadowImageDecoder({ onFrame: f => final = f }); decoder.push(encode(pixels, { width: 65, height: 63, omitBits: 3 })); decoder.finish();
  for (let i = 3; i < pixels.length; i += 4) assert.equal(final.rgba[i], pixels[i]);
  assert.notDeepEqual(final.rgba, pixels);
});
test('one-byte streaming, bounded buffers and exact completion', () => {
  const bytes = encode(samples(17, 33, 3), { width: 17, height: 33, channels: 3 });
  const decoder = new ShadowImageDecoder(); for (const b of bytes) decoder.push(Uint8Array.of(b)); decoder.finish();
  assert.throws(() => decoder.push(Uint8Array.of(0)), /Trailing/);
  for (const end of [0, 1, 23, 24, 31, bytes.length - 1]) { const d = new ShadowImageDecoder(); d.push(bytes.subarray(0, end)); assert.throws(() => d.finish()); }
  const bad = bytes.slice(); bad[30] ^= 1; assert.throws(() => new ShadowImageDecoder().push(bad), /Checksum/);
  const wrongSequence = bytes.slice(); const packetLength = new DataView(wrongSequence.buffer).getUint32(24); wrongSequence[31] = 99; seal(wrongSequence.subarray(24, 48 + packetLength).slice()).forEach((b,i)=>wrongSequence[24+i]=b);
  assert.throws(() => new ShadowImageDecoder().push(wrongSequence), /sequence/);
  assert.throws(() => new ShadowImageDecoder({ maxPixels: 3 }).push(bytes), /oversized/);
  const huge = bytes.slice(); new DataView(huge.buffer).setUint32(24, 999999); assert.throws(() => new ShadowImageDecoder().push(huge), /limit/);
});
test('entropy choices round-trip zeros, sparse and noisy blocks', () => {
  for (const values of [new Int32Array(4096), Int32Array.from({length:4096},(_,i)=>i%61?0:-1), Int32Array.from({length:4096},(_,i)=>(i*73)%1000-500)]) {
    assert.deepEqual(decodeBlock(encodeBlock(values), values.length), values);
    assert.throws(() => decodeBlock(encodeBlock(values).subarray(0,1), values.length));
  }
});
test('cooperative decoding and abort', async () => {
  const bytes = encode(samples(80, 79, 4), { width: 80, height: 79 });
  const d = new ShadowImageDecoder(); await d.pushAsync(bytes, { budgetMs: 1 }); d.finish();
  const controller = new AbortController(); controller.abort();
  await assert.rejects(new ShadowImageDecoder().pushAsync(bytes, { signal: controller.signal }), { name: 'AbortError' });
});
test('version, malformed block, missing dependencies, and sticky failure', () => {
  const original = encode(samples(35, 33, 4), { width: 35, height: 33 });
  const editHeader = mutate => { const bytes = original.slice(); mutate(bytes); bytes.set(seal(bytes.subarray(0,24).slice())); return bytes; };
  assert.throws(() => new ShadowImageDecoder().push(editHeader(b=>b[4]=99)), /Unsupported/);
  assert.throws(() => new ShadowImageDecoder().push(editHeader(b=>b[5]=9)), /Invalid/);
  const editPacket = mutate => { const bytes=original.slice(),len=new DataView(bytes.buffer).getUint32(24),packet=bytes.slice(24,48+len);mutate(packet);bytes.set(seal(packet),24);return bytes; };
  assert.throws(()=>new ShadowImageDecoder().push(editPacket(b=>b[8]=1)),/dependency/);
  assert.throws(()=>new ShadowImageDecoder().push(editPacket(b=>b[24]=255)),/coding/);
  assert.throws(()=>new ShadowImageDecoder().push(editPacket(b=>b[10]=0)),/checkpoint/);
  const d=new ShadowImageDecoder(),bad=original.slice();bad[20]^=1;assert.throws(()=>d.push(bad));assert.throws(()=>d.push(original),/failed/);
  assert.throws(()=>new ShadowImageDecoder({maxBufferedBytes:10}),/limits/);
});

test('accepts Uint8Array chunks from another realm', async () => {
  const { runInNewContext } = await import('node:vm');
  const pixels = samples(3, 2, 4);
  const encoded = encode(pixels, { width: 3, height: 2 });
  const foreign = runInNewContext('Uint8Array.from(values)', { values: Array.from(encoded) });
  assert.equal(foreign instanceof Uint8Array, false);
  let final;
  const decoder = new ShadowImageDecoder({ onFrame: frame => { final = frame; } });
  decoder.push(foreign); decoder.finish();
  assert.deepEqual(Array.from(final.rgba), Array.from(pixels));
  assert.throws(() => new ShadowImageDecoder().push(new Uint16Array(4)), /Expected Uint8Array/);
});

test('validation without frame output checks complete streams and corrupt packets', () => {
  const encoded = encode(samples(67, 65, 4), { width: 67, height: 65 });
  const validator = new ShadowImageDecoder();
  validator.push(encoded);
  assert.equal(validator.finish().width, 67);
  assert.equal(validator.lastFrameAt, -Infinity, 'no display reconstruction without a frame consumer');
  const corrupt = encoded.slice(); corrupt[corrupt.length - 1] ^= 1;
  assert.throws(() => new ShadowImageDecoder().push(corrupt));
  const truncated = new ShadowImageDecoder(); truncated.push(encoded.subarray(0, -24));
  assert.throws(() => truncated.finish(), /Incomplete/);
});
