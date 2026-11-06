// Reversible integer CDF 5/3 lifting, symmetric boundary extension.
export function dimensions(width, height, baseSize) {
  const levels = [[width, height]];
  while (width > baseSize || height > baseSize) {
    width = Math.ceil(width / 2); height = Math.ceil(height / 2);
    levels.unshift([width, height]);
  }
  return levels;
}

function forwardLine(line, n, temp) {
  if (n < 2) return;
  for (let i = 1; i < n; i += 2)
    line[i] -= Math.floor((line[i - 1] + line[i + 1 < n ? i + 1 : i - 1]) / 2);
  for (let i = 0; i < n; i += 2)
    line[i] += Math.floor((line[i ? i - 1 : 1] + line[i + 1 < n ? i + 1 : i - 1] + 2) / 4);
  let p = 0;
  for (let i = 0; i < n; i += 2) temp[p++] = line[i];
  for (let i = 1; i < n; i += 2) temp[p++] = line[i];
  line.set(temp.subarray(0, n));
}

function inverseLine(line, n, temp) {
  if (n < 2) return;
  let p = 0;
  for (let i = 0; i < n; i += 2) temp[i] = line[p++];
  for (let i = 1; i < n; i += 2) temp[i] = line[p++];
  for (let i = 0; i < n; i += 2)
    temp[i] -= Math.floor((temp[i ? i - 1 : 1] + temp[i + 1 < n ? i + 1 : i - 1] + 2) / 4);
  for (let i = 1; i < n; i += 2)
    temp[i] += Math.floor((temp[i - 1] + temp[i + 1 < n ? i + 1 : i - 1]) / 2);
  line.set(temp.subarray(0, n));
}

export function transform(data, width, height, channels, levels) {
  const line = new Int32Array(Math.max(width, height)), temp = line.slice();
  for (let level = levels.length - 1; level > 0; level--) {
    const [w, h] = levels[level];
    for (let c = 0; c < channels; c++) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) line[x] = data[(y * width + x) * channels + c];
        forwardLine(line, w, temp);
        for (let x = 0; x < w; x++) data[(y * width + x) * channels + c] = line[x];
      }
      for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) line[y] = data[(y * width + x) * channels + c];
        forwardLine(line, h, temp);
        for (let y = 0; y < h; y++) data[(y * width + x) * channels + c] = line[y];
      }
    }
  }
}

// Enumerate a scale's three high-frequency subbands in scan order, then channel.
export function coefficientIndex(index, level, levels, width, channels) {
  const [w] = levels[level], [lw, lh] = level ? levels[level - 1] : [0, 0];
  const c = index % channels, p = Math.floor(index / channels), top = (w - lw) * lh;
  const y = p < top ? Math.floor(p / (w - lw)) : lh + Math.floor((p - top) / w);
  const x = p < top ? lw + p % (w - lw) : (p - top) % w;
  return (y * width + x) * channels + c;
}

export function coefficientCount(level, levels, channels) {
  const [w, h] = levels[level], [lw, lh] = level ? levels[level - 1] : [0, 0];
  return (w * h - lw * lh) * channels;
}

// Yield between rows/columns so the browser can schedule other work.
export function* reconstruct(coefficients, width, channels, levels, level) {
  const [w, h] = levels[level], data = new Int32Array(w * h * channels);
  for (let y = 0; y < h; y++) {
    data.set(coefficients.subarray(y * width * channels, (y * width + w) * channels), y * w * channels);
    if (!(y % 16)) yield;
  }
  const line = new Int32Array(Math.max(w, h)), temp = line.slice();
  for (let l = 1; l <= level; l++) {
    const [sw, sh] = levels[l];
    for (let c = 0; c < channels; c++) {
      for (let x = 0; x < sw; x++) {
        for (let y = 0; y < sh; y++) line[y] = data[(y * w + x) * channels + c];
        inverseLine(line, sh, temp);
        for (let y = 0; y < sh; y++) data[(y * w + x) * channels + c] = line[y];
        if (!(x % 8)) yield;
      }
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) line[x] = data[(y * w + x) * channels + c];
        inverseLine(line, sw, temp);
        for (let x = 0; x < sw; x++) data[(y * w + x) * channels + c] = line[x];
        if (!(y % 8)) yield;
      }
    }
  }
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    rgba[p * 4] = data[p * channels]; rgba[p * 4 + 1] = data[p * channels + 1];
    rgba[p * 4 + 2] = data[p * channels + 2]; rgba[p * 4 + 3] = channels === 4 ? data[p * channels + 3] : 255;
    if (!(p % 4096)) yield;
  }
  return { rgba, width: w, height: h };
}
