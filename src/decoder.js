import { dimensions, coefficientCount, coefficientIndex, reconstruct } from './codec/wavelet.js';
import { decodeBlock } from './codec/entropy.js';
import { verify } from './codec/format.js';

/** Stateful bounded parser. Call push OR await pushAsync; never concurrently. */
export class ShadowImageDecoder {
  constructor({ onFrame = () => {}, onHeader = () => {}, maxPixels = 4_000_000, maxBufferedBytes = 65536, maxPacketBytes = 16384, frameIntervalMs = 0 } = {}) {
    if (![maxPixels, maxBufferedBytes, maxPacketBytes].every(n => Number.isSafeInteger(n) && n > 0) || maxBufferedBytes < 24 || !Number.isFinite(frameIntervalMs) || frameIntervalMs < 0) throw Error('Invalid decoder limits');
    Object.assign(this, { onFrame, onHeader, maxPixels, maxBufferedBytes, maxPacketBytes, frameIntervalMs });
    this.buffer = new Uint8Array(24); this.used = 0; this.target = 24;
    this.sequence = 0; this.level = 0; this.plane = 255; this.offset = 0; this.bytes = 0; this.lastFrameAt = -Infinity;
    this.done = false; this.failed = false; this.busy = false; this.maxSliceMs = 0;
  }
  *consume(chunk) {
    if (!(chunk instanceof Uint8Array)) throw Error('Expected Uint8Array');
    for (let p = 0; p < chunk.length;) {
      if (this.done) throw Error('Trailing stream bytes');
      const n = Math.min(chunk.length - p, this.target - this.used);
      this.buffer.set(chunk.subarray(p, p + n), this.used); p += n; this.used += n; this.bytes += n;
      if (this.used !== this.target) continue;
      if (!this.header) {
        verify(this.buffer); const b = this.buffer, v = new DataView(b.buffer);
        if (b[0] !== 83 || b[1] !== 72 || b[2] !== 80 || b[3] !== 50 || b[4] !== 2 || b[16] !== 1 || b[17] || b[18] || b[19]) throw Error('Unsupported SHP2 header');
        const width = v.getUint32(8), height = v.getUint32(12), channels = b[5], baseSize = b[6], omitBits = b[7];
        if (!width || !height || width > 65535 || height > 65535 || width * height > this.maxPixels || ![3, 4].includes(channels) || ![16, 32, 64].includes(baseSize) || omitBits > 4) throw Error('Invalid or oversized image');
        this.header = { width, height, channels, baseSize, omitBits, lossless: !omitBits };
        this.levels = dimensions(width, height, baseSize); this.coefficients = new Int32Array(width * height * channels);
        this.onHeader(this.header); this.used = 0; yield; continue;
      }
      if (this.target === 24) {
        const length = new DataView(this.buffer.buffer).getUint32(0);
        if (length > this.maxPacketBytes || length + 24 > this.maxBufferedBytes) throw Error('Packet exceeds buffer limit');
        if (length) { const b = new Uint8Array(length + 24); b.set(this.buffer); this.buffer = b; this.target = b.length; continue; }
      }
      yield* this.packet(); this.buffer = new Uint8Array(24); this.target = 24; this.used = 0; yield;
    }
  }
  *packet() {
    const b = this.buffer, v = new DataView(b.buffer); verify(b);
    const level = b[8], plane = b[9], flags = b[10], offset = v.getUint32(12), count = v.getUint16(16);
    if (v.getUint32(4) !== this.sequence++ || b[11] || b[18] || b[19] || flags > 1) throw Error('Invalid packet sequence or flags');
    if (plane === 254) {
      if (level !== this.levels.length || this.level !== level || count || offset || flags || b.length !== 24) throw Error('Premature END');
      this.done = true; return;
    }
    if (level !== this.level || offset !== this.offset || level >= this.levels.length) throw Error('Invalid dependency order');
    if (this.plane === null) { if (plane > 15 || plane < this.bottom()) throw Error('Invalid bitplane'); this.plane = plane; }
    if (plane !== this.plane) throw Error('Missing bitplane');
    const total = coefficientCount(level, this.levels, this.header.channels);
    if (!count || count > 4096 || offset + count > total || Boolean(flags) !== (offset + count === total)) throw Error('Invalid checkpoint or block length');
    const values = decodeBlock(b.subarray(24), count), { width, channels, omitBits } = this.header;
    for (let j = 0; j < count; j++) {
      const index = coefficientIndex(offset + j, level, this.levels, width, channels), value = values[j];
      if (level && (Math.abs(value) > 1 || ((offset + j) % channels !== 3 && plane < omitBits && value))) throw Error('Invalid refinement bit');
      const previous = this.coefficients[index];
      if (level && value && previous && Math.sign(value) !== Math.sign(previous)) throw Error('Coefficient sign changed');
      this.coefficients[index] = level ? previous + value * 2 ** plane : value;
    }
    this.offset += count;
    if (flags) {
      const final = level === this.levels.length - 1 && (!level || plane === this.bottom());
      if (final || level === 0 || performance.now() - this.lastFrameAt >= this.frameIntervalMs) {
        const frame = yield* reconstruct(this.coefficients, width, channels, this.levels, level);
        this.lastFrameAt = performance.now();
        this.onFrame({ ...frame, level, plane, final, bytes: this.bytes, targetWidth: width, targetHeight: this.header.height });
      }
      this.offset = 0;
      if (!level || plane === this.bottom()) { this.level++; this.plane = null; } else this.plane--;
    }
  }
  bottom() { return this.header.channels === 4 ? 0 : this.header.omitBits; }
  enter() { if (this.busy || this.failed) throw Error('Decoder busy or failed'); this.busy = true; }
  push(chunk) {
    this.enter(); try { for (const _ of this.consume(chunk)) { /* synchronous API */ } }
    catch (error) { this.failed = true; throw error; } finally { this.busy = false; }
  }
  async pushAsync(chunk, { budgetMs = 8, signal } = {}) {
    this.enter(); let start = performance.now();
    try {
      for (const _ of this.consume(chunk)) {
        if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
        const elapsed = performance.now() - start;
        if (elapsed >= budgetMs) { this.maxSliceMs = Math.max(this.maxSliceMs, elapsed); await new Promise(r => setTimeout(r, 0)); start = performance.now(); }
      }
    } catch (error) { this.failed = true; throw error; }
    finally { this.maxSliceMs = Math.max(this.maxSliceMs, performance.now() - start); this.busy = false; }
  }
  finish() { if (this.failed || this.busy || !this.done || this.used) throw Error('Incomplete or failed SHP2 stream'); return this.header; }
}
