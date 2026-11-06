import { FrameType, ShadowimgStreamReader } from "../protocol/shadowimg.js";

function decodeRgbaPayload(payload) {
  if (payload.length < 4) throw new Error("Invalid payload");
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const w = view.getUint16(0, false);
  const h = view.getUint16(2, false);
  const raw = payload.subarray(4);
  if (raw.length !== w * h * 4) throw new Error("RGBA payload size mismatch");
  return { w, h, raw };
}

export class ShadowImagePlayer {
  constructor(options) {
    this.canvas = options.canvas;
    this.ctx = this.canvas.getContext("2d");
    this.url = options.url;
    this.onStageChange = options.onStageChange || (() => {});
    this.onError = options.onError || (() => {});
    this.stopped = false;
  }

  stop() {
    this.stopped = true;
  }

  async start() {
    try {
      const res = await fetch(this.url, { cache: "no-store" });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const parser = new ShadowimgStreamReader();

      while (!this.stopped) {
        const { done, value } = await reader.read();
        if (done) break;
        const events = parser.push(value);

        for (const ev of events) {
          if (ev.kind === "header") {
            this.canvas.width = ev.value.width;
            this.canvas.height = ev.value.height;
            this.onStageChange({ stage: "header", header: ev.value });
            continue;
          }

          const frame = ev.value;
          if (!frame.valid) {
            this.onStageChange({ stage: "dropped", layerIndex: frame.layerIndex });
            continue;
          }

          if (frame.type === FrameType.BASE || frame.type === FrameType.ENHANCE) {
            this.drawFrame(frame);
          } else if (frame.type === FrameType.END) {
            this.onStageChange({ stage: "end" });
            return;
          }
        }
      }
    } catch (err) {
      this.onError(err);
    }
  }

  drawFrame(frame) {
    const { w, h, raw } = decodeRgbaPayload(frame.payload);
    const image = new ImageData(new Uint8ClampedArray(raw.buffer, raw.byteOffset, raw.byteLength), w, h);
    const offscreen = document.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h;
    const offCtx = offscreen.getContext("2d");
    offCtx.putImageData(image, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(offscreen, 0, 0, this.canvas.width, this.canvas.height);
    this.onStageChange({
      stage: frame.type === FrameType.BASE ? "base" : "enhance",
      layerIndex: frame.layerIndex,
    });
  }
}
