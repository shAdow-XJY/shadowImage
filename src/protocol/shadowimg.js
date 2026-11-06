import { crc32 } from "./crc32.js";

const MAGIC = new TextEncoder().encode("SHADOWIMG");
const FIXED_HEADER_BYTES = MAGIC.length + 1 + 2 + 4 + 4 + 1 + 1 + 1;

export const FrameType = {
  BASE: 1,
  ENHANCE: 2,
  META: 3,
  END: 255,
};

function readU16(view, offset) {
  return view.getUint16(offset, false);
}

function readU32(view, offset) {
  return view.getUint32(offset, false);
}

export class ShadowimgStreamReader {
  constructor() {
    this.buffer = new Uint8Array(0);
    this.header = null;
  }

  push(chunk) {
    const merged = new Uint8Array(this.buffer.length + chunk.length);
    merged.set(this.buffer, 0);
    merged.set(chunk, this.buffer.length);
    this.buffer = merged;

    const out = [];
    if (!this.header) {
      const header = this.tryReadHeader();
      if (!header) return out;
      out.push({ kind: "header", value: header });
    }

    while (true) {
      const frame = this.tryReadFrame();
      if (!frame) break;
      out.push({ kind: "frame", value: frame });
      if (frame.type === FrameType.END) break;
    }
    return out;
  }

  tryReadHeader() {
    if (this.buffer.length < FIXED_HEADER_BYTES) return null;
    const basic = this.buffer.subarray(0, MAGIC.length);
    for (let i = 0; i < MAGIC.length; i += 1) {
      if (basic[i] !== MAGIC[i]) throw new Error("Invalid SHADOWIMG magic");
    }

    const baseView = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
    const modelIdLen = this.buffer[MAGIC.length + 1 + 2 + 4 + 4 + 1];
    const totalLen = FIXED_HEADER_BYTES + modelIdLen;
    if (this.buffer.length < totalLen) return null;

    const version = this.buffer[MAGIC.length];
    const flags = readU16(baseView, MAGIC.length + 1);
    const width = readU32(baseView, MAGIC.length + 3);
    const height = readU32(baseView, MAGIC.length + 7);
    const colorSpace = this.buffer[MAGIC.length + 11];
    const modelIdStart = MAGIC.length + 12 + 1;
    const modelId = new TextDecoder().decode(this.buffer.subarray(modelIdStart, modelIdStart + modelIdLen));
    const totalLayers = this.buffer[modelIdStart + modelIdLen];

    this.header = {
      version,
      flags,
      width,
      height,
      colorSpace,
      modelId,
      totalLayers,
    };

    this.buffer = this.buffer.subarray(totalLen);
    return this.header;
  }

  tryReadFrame() {
    if (this.buffer.length < 15) return null;
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
    const type = this.buffer[0];
    const layerIndex = readU16(view, 1);
    const timestampMs = readU32(view, 3);
    const payloadLength = readU32(view, 7);
    const totalLen = 11 + payloadLength + 4;
    if (this.buffer.length < totalLen) return null;

    const payload = this.buffer.subarray(11, 11 + payloadLength);
    const expected = readU32(view, 11 + payloadLength);
    const actual = crc32(payload);

    this.buffer = this.buffer.subarray(totalLen);

    return {
      type,
      layerIndex,
      timestampMs,
      payload,
      valid: expected === actual,
    };
  }
}
