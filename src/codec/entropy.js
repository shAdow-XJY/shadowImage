const zig = n => n < 0 ? -2 * n - 1 : 2 * n;
const unzig = n => n & 1 ? -(n + 1) / 2 : n / 2;
function putVar(out, n) { do { const b = n & 127; n = Math.floor(n / 128); out.push(b | (n ? 128 : 0)); } while (n); }

export function encodeBlock(values) {
  const plain = [0], runs = [1];
  for (const v of values) putVar(plain, zig(v));
  for (let i = 0; i < values.length;) {
    const start = i; while (i < values.length && values[i] === 0) i++;
    putVar(runs, i - start); if (i < values.length) putVar(runs, zig(values[i++]));
  }
  let best = plain.length <= runs.length ? plain : runs;
  // Rice is used only when bounded unary work beats the current best representation.
  for (let k = 0; k <= 10; k++) {
    let bits = 0;
    for (const v of values) { bits += Math.floor(zig(v) / 2 ** k) + 1 + k; if (bits > best.length * 8) break; }
    if (1 + Math.ceil(bits / 8) >= best.length) continue;
    const out = [16 + k]; let byte = 0, used = 0;
    const bit = b => { byte = (byte << 1) | b; if (++used === 8) { out.push(byte); byte = used = 0; } };
    for (const v of values) {
      const n = zig(v); for (let q = Math.floor(n / 2 ** k); q > 0; q--) bit(0); bit(1);
      for (let j = k - 1; j >= 0; j--) bit((n >>> j) & 1);
    }
    if (used) out.push(byte << (8 - used)); best = out;
  }
  // Refinement symbols are ternary: Rice-code zero runs, then one sign bit.
  if (values.every(v => Math.abs(v) <= 1)) for (let k = 0; k <= 10; k++) {
    let bits = 0;
    for (let i = 0; i < values.length;) {
      const start = i; while (i < values.length && !values[i]) i++;
      bits += Math.floor((i - start) / 2 ** k) + 1 + k;
      if (i < values.length) { bits++; i++; }
    }
    if (1 + Math.ceil(bits / 8) >= best.length) continue;
    const out = [32 + k]; let byte = 0, used = 0;
    const bit = b => { byte = (byte << 1) | b; if (++used === 8) { out.push(byte); byte = used = 0; } };
    for (let i = 0; i < values.length;) {
      const start = i; while (i < values.length && !values[i]) i++;
      const run = i - start;
      for (let q = Math.floor(run / 2 ** k); q > 0; q--) bit(0); bit(1);
      for (let j = k - 1; j >= 0; j--) bit((run >>> j) & 1);
      if (i < values.length) bit(values[i++] > 0 ? 1 : 0);
    }
    if (used) out.push(byte << (8 - used)); best = out;
  }
  return Uint8Array.from(best);
}

export function decodeBlock(bytes, count) {
  if (!count || count > 4096 || !bytes.length) throw Error('Invalid block');
  const out = new Int32Array(count), mode = bytes[0]; let p = 1;
  const variable = () => {
    let n = 0;
    for (let shift = 0; shift <= 21; shift += 7) {
      if (p >= bytes.length) throw Error('Truncated integer');
      const b = bytes[p++]; n += (b & 127) * 2 ** shift;
      if (!(b & 128)) { if (n > 65535) throw Error('Coefficient overflow'); return n; }
    } throw Error('Integer overflow');
  };
  if (mode === 0) { for (let i = 0; i < count; i++) out[i] = unzig(variable()); }
  else if (mode === 1) {
    for (let i = 0; i < count;) {
      i += variable(); if (i > count) throw Error('Run overflow');
      if (i < count) { const n = variable(); if (!n) throw Error('Noncanonical zero run'); out[i++] = unzig(n); }
    }
  } else if ((mode >= 16 && mode <= 26) || (mode >= 32 && mode <= 42)) {
    const runs = mode >= 32, k = mode - (runs ? 32 : 16); let pos = 8;
    const bit = () => { if (pos >= bytes.length * 8) throw Error('Truncated Rice code'); return (bytes[pos >>> 3] >>> (7 - (pos++ & 7))) & 1; };
    for (let i = 0; i < count;) {
      let q = 0; while (!bit()) { if (++q > 65535) throw Error('Rice overflow'); }
      let n = q * 2 ** k; for (let j = k - 1; j >= 0; j--) n += bit() * 2 ** j;
      if (n > 65535) throw Error('Coefficient overflow');
      if (runs) { i += n; if (i > count) throw Error('Run overflow'); if (i < count) out[i++] = bit() ? 1 : -1; }
      else out[i++] = unzig(n);
    }
    while (pos & 7) if (bit()) throw Error('Nonzero padding'); p = pos / 8;
  } else throw Error('Unknown block coding');
  if (p !== bytes.length) throw Error('Trailing block bytes');
  return out;
}
