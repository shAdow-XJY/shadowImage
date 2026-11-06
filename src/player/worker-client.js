export class WorkerDecoder {
  constructor(worker, onHeader, onFrame) {
    this.worker = worker; this.pending = new Map(); this.id = 0; this.maxSliceMs = 0;
    worker.onmessage = ({ data }) => {
      try {
      if (data.type === 'header') onHeader(data.header);
      else if (data.type === 'frame') onFrame(data.frame);
      else {
        const request = this.pending.get(data.id); if (!request) return;
        this.pending.delete(data.id); clearTimeout(request.timer);
        this.maxSliceMs = Math.max(this.maxSliceMs, data.maxSliceMs || 0);
        if (data.type === 'error') request.reject(Error(data.message)); else request.resolve();
      }
      } catch (error) { this.close(error); }
    };
    worker.onerror = e => this.close(Error(e.message || 'Worker failed'));
  }
  call(type, fields = {}, transfers = [], timeout = 30000) {
    if (this.closed) return Promise.reject(Error('Worker closed'));
    const id = this.id++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.close(Error('Worker timed out')); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.worker.postMessage({ id, type, ...fields }, transfers); }
      catch (error) { this.close(error); }
    });
  }
  close(error = new DOMException('Stopped', 'AbortError')) {
    this.closed = true; this.worker.terminate();
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); } this.pending.clear();
  }
}
