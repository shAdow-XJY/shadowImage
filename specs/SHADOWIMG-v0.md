# SHADOWIMG v0 (ShadowImage Streaming Format)

SHADOWIMG v0 is a custom progressive image stream format for web transport and incremental rendering.

## Goals

- Single resource stream (not multiple image URLs)
- First visible frame ASAP
- Incremental enhancement from blurry to clear
- Browser-side custom decoder/component ownership

## Transport

- Recommended: HTTP chunked transfer
- File extension: `.shadowimg`
- MIME: `application/x-shadowimg`

## Binary layout

All integer fields are **big-endian**.

### Header (once)

| Field | Size | Type | Description |
|---|---:|---|---|
| magic | 9 | bytes | ASCII `SHADOWIMG` |
| version | 1 | u8 | Format version, current `1` |
| flags | 2 | u16 | Reserved |
| width | 4 | u32 | Target width |
| height | 4 | u32 | Target height |
| colorSpace | 1 | u8 | `1=SRGB` |
| modelIdLen | 1 | u8 | UTF-8 model id length |
| modelId | N | bytes | Encoder model id |
| totalLayers | 1 | u8 | Enhancement layer count |

### Frame (repeated)

| Field | Size | Type | Description |
|---|---:|---|---|
| type | 1 | u8 | `1=BASE`, `2=ENHANCE`, `3=META`, `255=END` |
| layerIndex | 2 | u16 | Layer number |
| timestampMs | 4 | u32 | Encoder-side timestamp |
| payloadLength | 4 | u32 | Payload bytes |
| payload | N | bytes | Frame payload |
| crc32 | 4 | u32 | CRC32 of payload |

## PoC payload contract

For `BASE` and `ENHANCE`, payload is:

| Field | Size | Type |
|---|---:|---|
| frameWidth | 2 | u16 |
| frameHeight | 2 | u16 |
| rgba | frameWidth*frameHeight*4 | bytes |

Renderer scales this frame to target canvas size. In production, payload can be replaced with latent chunks.

## Error strategy (best effort)

- Header parse failure: fail stream
- Frame payload CRC mismatch: drop frame, continue
- Missing intermediate enhancement frames: continue with newest valid frame
- Timeout or network close before `END`: keep last rendered frame
