# SHP2 experimental stream, version 2

One dependent image codestream: the base is low-frequency transform information, not an embedded thumbnail. Refinements contribute coefficient bits. HTTP chunks are unrelated to coding packets. Store as `.shp`, serve as `application/x-shadowimage`.

## Header: 24 bytes, multibyte integers big-endian

| Offset | Field |
|---|---|
| 0 | ASCII SHP2 (4 bytes) |
| 4 | Version u8 = 2 |
| 5 | Channels u8 = 3 (RGB) or 4 (RGBA) |
| 6 | Base maximum dimension u8 = 16, 32 or 64 |
| 7 | Omitted color precision bits u8 = 0–4 |
| 8 | Width u32, 1–65535 |
| 12 | Height u32, 1–65535 |
| 16 | Algorithm u8 = 1 (integer CDF 5/3) |
| 17 | Reserved three zero bytes |
| 20 | CRC32 of bytes 0–19 |

Default budget: 4 million pixels. Static SDR sRGB samples, straight alpha. No animation/HDR/ICC metadata. Offline adapters normalize color/orientation before encoding. Exactness means equality with the input samples, not recovery of the source compressed file.

## Transform

Repeatedly ceil-halve dimensions until both fit the base size. Transform rows then columns, largest scale first, per channel. Odd samples subtract floor((left-even + right-even)/2); even samples add floor((left-detail + right-detail + 2)/4). Mirror the adjacent sample at boundaries. Length-one lines are unchanged. Pack evens before odds. Invert operations in reverse order, columns then rows, smallest scale first. Keep signed integers throughout; clamp only display output.

Base coefficients are exact. Each subsequent scale contains the three high-frequency subbands outside its smaller top-left low-frequency rectangle. Enumerate row-major, skipping that rectangle, channels fastest. Send magnitude bitplanes most-significant first, representing each bit as -1, 0 or +1. Signs cannot change. State is accumulated. RGB bits below omitBits are zero; alpha always reaches bit zero. RGB-only streams stop at omitBits. No per-pixel error bound is promised for omitted wavelet bits.

## Packet: 24-byte header plus payload

| Offset | Field |
|---|---|
| 0 | Payload length u32 |
| 4 | Sequence u32, starts at zero |
| 8 | Scale u8, base = 0 |
| 9 | Plane u8: base 255, END 254, refinement 0–15 |
| 10 | Flags u8: 1 = complete scale/plane checkpoint, otherwise 0 |
| 11 | Reserved zero |
| 12 | Coefficient offset u32 in this scale/plane |
| 16 | Sample count u16, 1–4096 (END = 0) |
| 18 | Two reserved zero bytes |
| 20 | CRC32 over bytes 0–19 concatenated with payload |

Base and each plane cover all scale coefficients contiguously. Checkpoint is mandatory exactly on the last block. First plane declares the highest bit; subsequent planes decrement by one. Scales ascend. END has scale equal to number of scales, zero flags/offset/count/payload and follows the final plane. No bytes follow END. CRC detects corruption; it does not authenticate input.

## Entropy blocks

Encoder chooses the smallest representation per block, ties preferring varint then zero-run. Payload starts with a mode byte:

- 0: signed zigzag values in little-endian base-128 varints. Zigzag(v) = 2v for v >= 0, otherwise -2v-1.
- 1: unsigned varint zero-run length, then one nonzero zigzag varint, repeated. A zero-run reaching sample count terminates without another value.
- 16–26: Rice k = mode-16. Zigzag n becomes floor(n/2^k) zeros, one stop bit, then k remainder bits MSB first. Pack bits MSB first; final byte padding is zero.
- 32–42: ternary values (-1/0/+1), normally refinement blocks. Rice k = mode-32 encodes each zero-run length, followed by a sign bit (1 positive, 0 negative) for one nonzero sample. A run reaching sample count terminates without a sign bit. Same packing/padding as Rice above.

Zigzag integers are limited to 65535. Refinement values must be -1/0/+1. Default payload limit 16 KiB; parser buffer limit 64 KiB. The parser buffers one packet without concatenating the received prefix.

## Output and errors

Checkpoints reconstruct the whole view at the current scale. Renderer may coalesce checkpoints but decoder cannot discard dependent packets. Final pixels can arrive before END: final-image callback is not proof of stream completeness. finish() requires END with no remaining partial packet. Corruption, unsupported version, invalid order or limits fail permanently; retain the last valid displayed frame. Never skip damaged dependencies.

SHP1 and SHADOWIMG v0 remain separate historical experiments. SHP2 is experimental and is not yet a permanent archival-compatibility promise.
