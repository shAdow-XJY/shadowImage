import { ShadowImageDecoder } from './decoder.js';
import { WorkerDecoder } from './player/worker-client.js';

/** Progressive SHP2 player. Original v0 player remains at its legacy module path. */
export class ShadowImagePlayer {
  constructor(options) {
    if (!options?.canvas) throw Error('canvas is required');
    this.options = options; this.canvas = options.canvas;
    this.ctx = this.canvas.getContext('2d'); if (!this.ctx) throw Error('Canvas 2D unavailable');
    this.surface = this.canvas.ownerDocument.createElement('canvas'); this.surfaceCtx = this.surface.getContext('2d');
    this.state = 'idle'; this.generation = 0;
  }
  emit(stage, detail = {}) { this.options.onProgress?.({ stage, ...detail }); }
  stop() {
    this.generation++;
    const session = this.session;
    if (session) {
      session.controller.abort(); session.worker?.close();
      session.reader?.cancel().catch(() => {}); clearTimeout(session.timer); session.pending = null;
    }
    if (this.state !== 'destroyed') this.state = 'stopped';
  }
  destroy() { this.stop(); this.state = 'destroyed'; this.surface.width = this.surface.height = 0; this.image = null; this.session = null; }
  async start(source = this.options.url ?? this.options.stream) {
    if (this.state === 'destroyed') throw Error('Player destroyed');
    this.stop(); const generation = this.generation, current = () => generation === this.generation;
    const session = { controller: new AbortController(), pending: null, lastDraw: -Infinity, start: performance.now(), received: 0 };
    this.session = session; this.state = 'loading';
    const onHeader = header => {
      if (!current()) return;
      this.canvas.width = header.width; this.canvas.height = header.height; this.emit('header', { header });
    };
    const draw = () => {
      session.timer = null; if (!current() || !session.pending) return;
      const f = session.pending; session.pending = null;
      if (!this.image || this.surface.width !== f.width || this.surface.height !== f.height) {
        this.surface.width = f.width; this.surface.height = f.height;
        this.image = this.surfaceCtx.createImageData(f.width, f.height);
      }
      this.image.data.set(f.rgba);
      this.surfaceCtx.putImageData(this.image, 0, 0); this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.imageSmoothingEnabled = true; this.ctx.drawImage(this.surface, 0, 0, this.canvas.width, this.canvas.height);
      session.lastDraw = performance.now();
      this.emit('frame', { level: f.level, plane: f.plane, final: f.final, bytes: f.bytes, width: f.width, height: f.height, elapsedMs: session.lastDraw - session.start });
      this.options.onFrame?.(f);
    };
    const onFrame = frame => {
      if (!current()) return;
      session.pending = frame;
      const wait = 50 - (performance.now() - session.lastDraw);
      if (frame.final || wait <= 0) { clearTimeout(session.timer); draw(); }
      else if (!session.timer) session.timer = setTimeout(draw, wait);
    };
    const decoderOptions = { ...this.options.limits, frameIntervalMs: 50 };
    let decoder, reader;
    try {
      if (this.options.execution !== 'main' && typeof Worker !== 'undefined') {
        try {
          const worker = new WorkerDecoder(new Worker(this.options.workerUrl || new URL('./player/worker.js', import.meta.url), { type: 'module' }), onHeader, onFrame);
          session.worker = worker; await worker.call('init', { options: decoderOptions }, [], 3000);
          this.emit('execution', { backend: 'worker' });
        } catch (error) {
          session.worker?.close(); session.worker = null; if (!current()) throw error;
          this.emit('fallback', { reason: 'worker-unavailable', message: error.message });
        }
      }
      if (!current()) return { status: 'stopped' };
      if (!session.worker) { decoder = new ShadowImageDecoder({ ...decoderOptions, onHeader, onFrame }); this.emit('execution', { backend: 'main' }); }
      let stream = source;
      if (typeof source === 'string' || source instanceof URL) {
        const response = await fetch(source, { ...this.options.fetchOptions, signal: session.controller.signal });
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        session.total = Number(response.headers.get('content-length')) || undefined;
        if (session.total > (this.options.maxStreamBytes ?? 128 * 1024 * 1024)) throw Error('Stream exceeds byte limit');
        if (response.body?.getReader) stream = response.body;
        else {
          this.emit('fallback', { reason: 'response-stream-unavailable', progressive: false });
          stream = new Uint8Array(await response.arrayBuffer());
        }
      }
      const feed = async bytes => {
        if (!current()) throw new DOMException('Stopped', 'AbortError');
        session.received += bytes.length;
        if (session.received > (this.options.maxStreamBytes ?? 128 * 1024 * 1024)) throw Error('Stream exceeds byte limit');
        // Copy only a bounded slice for transfer; never detach caller-owned buffers.
        for (let offset = 0; offset < bytes.length; offset += 65536) {
          if (!current()) throw new DOMException('Stopped', 'AbortError');
          const part = bytes.subarray(offset, offset + 65536);
          if (session.worker) { const owned = part.slice(); await session.worker.call('push', { bytes: owned }, [owned.buffer]); }
          else await decoder.pushAsync(part, { signal: session.controller.signal });
        }
        if (current()) this.emit('download', { bytes: session.received, total: session.total });
      };
      if (stream instanceof Uint8Array) await feed(stream);
      else if (stream?.getReader) {
        reader = stream.getReader(); session.reader = reader;
        while (current()) { const { value, done } = await reader.read(); if (done) break; await feed(value); }
      } else throw Error('Expected URL, Uint8Array, or ReadableStream');
      if (!current()) return { status: 'stopped' };
      if (session.worker) await session.worker.call('finish'); else decoder.finish();
      if (!current()) return { status: 'stopped' };
      clearTimeout(session.timer); draw(); this.state = 'complete';
      const result = { status: 'complete', bytes: session.received, elapsedMs: performance.now() - session.start, maxSliceMs: session.worker?.maxSliceMs ?? decoder.maxSliceMs };
      this.emit('complete', result); return result;
    } catch (error) {
      if (!current() || session.controller.signal.aborted) return { status: 'stopped' };
      this.state = 'error'; this.options.onError?.(error); throw error;
    } finally {
      clearTimeout(session.timer); session.pending = null; session.worker?.close();
      if (reader) { try { await reader.cancel(); } catch {} try { reader.releaseLock(); } catch {} }
    }
  }
}
