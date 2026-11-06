import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const FrameType = {
  BASE: 1,
  ENHANCE: 2,
  END: 255,
};

function crc32(bytes) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(v) {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(v);
  return b;
}

function u32(v) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(v >>> 0);
  return b;
}

function header() {
  const modelId = Buffer.from("latent-neural-v0-js", "utf8");
  return Buffer.concat([
    Buffer.from("SHADOWIMG"),
    Buffer.from([1]),
    u16(0),
    u32(640),
    u32(360),
    Buffer.from([1]),
    Buffer.from([modelId.length]),
    modelId,
    Buffer.from([8]),
  ]);
}

function framePayload(width, height, blurAmount) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const block = Math.max(1, blurAmount);
      const nx = Math.floor(x / block) * block;
      const ny = Math.floor(y / block) * block;
      rgba[i] = Math.floor((nx / width) * 255);
      rgba[i + 1] = Math.floor((ny / height) * 255);
      rgba[i + 2] = 180;
      rgba[i + 3] = 255;
    }
  }
  return Buffer.concat([u16(width), u16(height), rgba]);
}

function frame(type, layerIndex, timestampMs, payload) {
  const hash = crc32(payload);
  return Buffer.concat([
    Buffer.from([type]),
    u16(layerIndex),
    u32(timestampMs),
    u32(payload.length),
    payload,
    u32(hash),
  ]);
}

function serveFile(res, absPath, type) {
  fs.readFile(absPath, (err, buf) => {
    if (err) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    res.setHeader("Content-Type", type);
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.statusCode = 400;
    res.end();
    return;
  }

  if (req.url === "/" || req.url === "/demo/index.html") {
    serveFile(res, path.join(root, "demo", "index.html"), "text/html; charset=utf-8");
    return;
  }
  if (req.url === "/demo/app.js") {
    serveFile(res, path.join(root, "demo", "app.js"), "application/javascript; charset=utf-8");
    return;
  }
  if (req.url.startsWith("/src/")) {
    serveFile(res, path.join(root, req.url.slice(1)), "application/javascript; charset=utf-8");
    return;
  }
  if (req.url === "/stream.shadowimg") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/x-shadowimg");
    res.setHeader("Transfer-Encoding", "chunked");
    res.write(header());

    const frames = [
      frame(FrameType.BASE, 0, 0, framePayload(80, 45, 16)),
      frame(FrameType.ENHANCE, 1, 500, framePayload(160, 90, 8)),
      frame(FrameType.ENHANCE, 2, 1000, framePayload(320, 180, 4)),
      frame(FrameType.ENHANCE, 3, 1500, framePayload(640, 360, 1)),
      frame(FrameType.END, 65535, 2000, Buffer.alloc(0)),
    ];

    let i = 0;
    const timer = setInterval(() => {
      if (i >= frames.length) {
        clearInterval(timer);
        res.end();
        return;
      }
      res.write(frames[i]);
      i += 1;
    }, 450);
    return;
  }

  res.statusCode = 404;
  res.end("Not found");
});

server.listen(8080, () => {
  console.log("Demo server: http://localhost:8080");
});
