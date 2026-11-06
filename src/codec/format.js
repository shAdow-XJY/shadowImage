import { crc32 } from '../protocol/crc32.js';
export const HEADER_SIZE = 24, PACKET_SIZE = 24, BLOCK_SIZE = 4096;
export function checksum(bytes) {
  // Header and payload are protected; the checksum field itself is omitted.
  const protectedBytes = new Uint8Array(bytes.length - 4);
  protectedBytes.set(bytes.subarray(0, 20)); protectedBytes.set(bytes.subarray(24), 20);
  return crc32(protectedBytes);
}
export function seal(bytes) { new DataView(bytes.buffer).setUint32(20, checksum(bytes)); return bytes; }
export function verify(bytes) {
  if (new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(20) !== checksum(bytes)) throw Error('Checksum mismatch');
}
