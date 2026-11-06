import { dimensions, transform, coefficientCount, coefficientIndex } from './codec/wavelet.js';
import { encodeBlock } from './codec/entropy.js';
import { seal, BLOCK_SIZE } from './codec/format.js';

/** Encode RGB/RGBA Uint8Array samples, without any browser image decoder dependency. */
export function encode(pixels, { width, height, channels = 4, baseSize = 32, omitBits = 0, maxPixels = 4_000_000 } = {}) {
  if (![width, height, baseSize, omitBits].every(Number.isInteger) || width < 1 || height < 1 || width * height > maxPixels || width > 65535 || height > 65535 || ![3, 4].includes(channels) || ![16, 32, 64].includes(baseSize) || omitBits < 0 || omitBits > 4 || !(pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray) || pixels.length !== width * height * channels) throw Error('Invalid encoder options or samples');
  const levels = dimensions(width, height, baseSize), coefficients = Int32Array.from(pixels);
  transform(coefficients, width, height, channels, levels);
  const header = new Uint8Array(24), hv = new DataView(header.buffer);
  header.set([83, 72, 80, 50, 2, channels, baseSize, omitBits]); hv.setUint32(8, width); hv.setUint32(12, height); header[16] = 1;
  const parts = [seal(header)]; let sequence = 0;
  const packet = (level, plane, offset, values, flags) => {
    const payload = values.length ? encodeBlock(values) : new Uint8Array(0), bytes = new Uint8Array(24 + payload.length), v = new DataView(bytes.buffer);
    v.setUint32(0, payload.length); v.setUint32(4, sequence++); bytes[8] = level; bytes[9] = plane; bytes[10] = flags;
    v.setUint32(12, offset); v.setUint16(16, values.length); bytes.set(payload, 24); parts.push(seal(bytes));
  };
  for (let level = 0; level < levels.length; level++) {
    const count = coefficientCount(level, levels, channels);
    let top = 0;
    if (level) for (let i = 0; i < count; i++) top = Math.max(top, Math.abs(coefficients[coefficientIndex(i, level, levels, width, channels)]));
    top = level ? Math.max(channels === 4 ? 0 : omitBits, Math.floor(Math.log2(top || 1))) : 255;
    const bottom = level ? (channels === 4 ? 0 : omitBits) : 255;
    for (let plane = top; plane >= bottom; plane--) {
      for (let offset = 0; offset < count; offset += BLOCK_SIZE) {
        const n = Math.min(BLOCK_SIZE, count - offset), values = new Int32Array(n);
        for (let j = 0; j < n; j++) {
          const i = offset + j, v = coefficients[coefficientIndex(i, level, levels, width, channels)];
          values[j] = !level ? v : (i % channels !== 3 && plane < omitBits) ? 0 : ((Math.abs(v) >>> plane) & 1) * Math.sign(v);
        }
        packet(level, plane, offset, values, offset + n === count ? 1 : 0);
      }
    }
  }
  packet(levels.length, 254, 0, [], 0);
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
