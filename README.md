# ShadowImage

[![CI](https://github.com/shAdow-XJY/shadowImage/actions/workflows/ci.yml/badge.svg)](https://github.com/shAdow-XJY/shadowImage/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/shAdow-XJY/shadowImage)](https://github.com/shAdow-XJY/shadowImage/releases)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

**单个自定义码流，先显示整张图片的轮廓，再随着下载从模糊逐步变清晰。**

ShadowImage 提供离线编码器、纯 JavaScript 流式解码器和网页播放器。图片预先转换为 `.shp` 文件，放到普通静态服务器或 CDN；网页组件读取增量数据，不需要另外生成和替换一张模糊缩略图，也不依赖浏览器原生支持特定的渐进图片编码。

当前版本 **v0.2.0**。核心编码、解码、加载与展示流程已实现；SHP2 属于尚未冻结的 0.x 协议。浏览器运行时零第三方依赖、无需 WASM，网页入口与可选 Worker 合计约 **7.7 KiB gzip**。编码工具的依赖不会进入网页运行包。

## 获取发布产物

前往 [GitHub Releases](https://github.com/shAdow-XJY/shadowImage/releases/latest)：

| 产物 | 用途 |
|---|---|
| `shadow-image-0.2.0.tgz` | 可通过 npm 安装的库，包含 ESM、TypeScript 类型和独立编码入口 |
| `shadow-image-browser-0.2.0.zip` | 可直接部署的 `dist/`、HTML 示例、原创示例码流与文档 |
| `SHA256SUMS` | 发布包的 SHA-256 校验值 |

尚未发布到 npm registry。可以安装下载的包：

```sh
npm install ./shadow-image-0.2.0.tgz
```

也可以直接从 Release 安装：

```sh
npm install https://github.com/shAdow-XJY/shadowImage/releases/download/v0.2.0/shadow-image-0.2.0.tgz
```

安装后使用 `import { ShadowImagePlayer } from 'shadow-image'`。打包工具处理 Worker 的方式可能不同，部署方式见下文。

## 最快体验：浏览器 ZIP

解压浏览器 ZIP，在解压出的 `shadow-image-0.2.0` 目录启动 HTTP 服务：

```sh
python -m http.server 8080
```

打开 `http://localhost:8080`。示例包含原创程序绘制的图片，不需要准备其他文件。静态文件在本地下载很快时，中间阶段会合并；可通过浏览器开发者工具限制网络速度观察渐进过程。请通过 HTTP/HTTPS 打开，不要直接双击 `file://` 页面。

## 将自己的图片编码为 .shp

离线转换普通图片需要源码中的工具（Node.js 20+，推荐 22）：

```sh
git clone https://github.com/shAdow-XJY/shadowImage.git
cd shadowImage
npm ci
npm run encode -- input.png output.shp --base=32 --omit=0
```

输入支持离线工具可读取的 PNG、JPEG、WebP 等静态图片。工具将方向和色彩规范化为 sRGB RGBA，不自动缩放图片。

| 参数 | 默认值 | 说明 |
|---|---:|---|
| `--base` | `32` | 基础层最长边上限，支持 16 / 32 / 64；越小越早到达，越大轮廓越清楚 |
| `--omit` | `0` | 0 表示精确还原输入像素；1–4 省略部分颜色精度，alpha 仍精确保留 |

将 `output.shp` 部署为普通静态资源即可。推荐 MIME `application/x-shadowimage`；`application/octet-stream` 也可读取。无需 WebSocket、服务端实时编码或指定 HTTP 版本。跨域加载需要正确配置 CORS，代理/CDN 也应避免将整个响应缓冲后再发送。

## 在网页中使用

将浏览器发布包中的 `dist/` 完整复制到网站，例如：

```text
public/
  vendor/shadow-image/
    index.js
    index.d.ts
    player/worker.js
  images/example.shp
```

```html
<canvas id="picture" role="img" aria-label="图片内容说明"></canvas>
<button id="cancel">停止加载</button>
<script type="module">
  import { ShadowImagePlayer } from '/vendor/shadow-image/index.js';

  const player = new ShadowImagePlayer({
    canvas: document.querySelector('#picture'),
    url: '/images/example.shp',
    execution: 'auto',
    onProgress(event) {
      if (event.stage === 'frame') {
        console.log(event.width, event.height, event.bytes, event.final);
      }
    },
    onError(error) { console.error(error); },
  });

  document.querySelector('#cancel').onclick = () => player.stop();
  player.start().catch(console.error);
  // 重新加载：player.start()
  // 组件卸载时：player.destroy()
</script>
```

`auto` 尝试模块 Worker，启动失败时自动使用主线程分片；`main` 强制主线程。Worker 与入口的默认相对路径是 `./player/worker.js`，部署时请保留目录结构。

**使用 Vite/Webpack 等打包工具时**，将发布包的 `dist/player/worker.js` 复制到网站静态目录，并显式指定地址，避免依赖打包工具对动态 Worker URL 的推断：

```js
import { ShadowImagePlayer } from 'shadow-image';
const player = new ShadowImagePlayer({
  canvas,
  url: '/images/example.shp',
  workerUrl: '/vendor/shadow-image/player/worker.js',
});
```

Worker 脚本和其访问须符合网站 CSP；最简单的部署方式是同源静态文件。Worker 主要隔离主线程负载，不代表无需 CPU。

## API 与行为

| API | 行为 |
|---|---|
| `player.start(source?)` | 读取 URL、`Uint8Array` 或 `ReadableStream<Uint8Array>`；省略时使用构造参数 |
| `player.stop()` | 立即请求取消网络与读取，保留最后显示的画面 |
| `player.destroy()` | 停止并释放中间渲染资源；销毁后不能重启 |
| `onFrame(frame)` | 获取独立的 RGBA 输出和层级、精度、字节数信息 |
| `onProgress(event)` | `header` / `execution` / `fallback` / `download` / `frame` / `complete` |

`start()` 返回 Promise，成功为 `{ status: 'complete', bytes, elapsedMs, maxSliceMs }`，取消为 `{ status: 'stopped' }`；错误会调用 `onError` 并 reject。再次启动会取代旧会话；已消费的流需要替换为新流。

播放器合并过密更新，中间画面最多每 50ms 展示一次，最终画面立即展示。主线程解码以约 8ms 为分片目标，并非硬实时上限。Worker 在解码中途发生错误时会报告失败，不会静默从头重放。

其他配置包括 `fetchOptions`、`maxStreamBytes`（默认 128 MiB）与 `limits: { maxPixels, maxPacketBytes, maxBufferedBytes }`。默认上限 400 万像素、单包 payload 16 KiB、解析缓冲 64 KiB。解析缓冲不包含整图工作内存；大图可能需要超过 144 MB 的数组及其他渲染资源，多图页面应控制并发与像素预算。

## 独立编解码

编码器和解码器可以脱离播放器使用。核心解码不依赖 DOM、Canvas 或原生图片解码器：

```js
import { encode } from 'shadow-image/encoder';
import { ShadowImageDecoder } from 'shadow-image';

const encoded = encode(rgba, {
  width, height, channels: 4, baseSize: 32, omitBits: 0,
});

const decoder = new ShadowImageDecoder({
  onFrame(frame) { /* frame.rgba、frame.width、frame.height */ },
});
decoder.push(encoded); // 实际使用时可多次传入任意边界的下载块
// 异步分片版本：await decoder.pushAsync(chunk, { budgetMs: 8, signal });
decoder.finish(); // 校验流完整结束
```

不要并发调用同一个解码器的 push 方法。`frame.final` 表示最终像素已生成，`finish()` 成功才表示码流完整接收。损坏或截断会报错，播放器保留最后有效画面。精确还原指编码器接收的像素，不是恢复原图片文件字节或其元数据。

## 算法与兼容性

SHP2 使用整数 5/3 小波分离低频轮廓和细节，再按尺度与位平面发送增量。后续数据细化同一套系数状态，不发送另一张完整图片。每个块选择 varint、零游程、Rice 或 Rice 零游程加符号位表示，并校验长度、顺序及 CRC。详见 [协议说明](specs/SHP2.md)。

播放器需要现代 ES modules、typed arrays、fetch、AbortController 和 Canvas 2D；渐进网络显示需要可读响应流。缺少响应流时会报告 `progressive: false` 并完整下载后解码。对未知长度响应，浏览器的 `arrayBuffer()` 分配可能先于下载总量校验；这条回退路径不承诺边下载边显示。

Chromium、Edge、Windows WebKit 已验证真实流播放；Firefox、Chrome 正式版、Safari 和手机真机尚未全部验证。12 张真实图片、三种基础层尺寸通过精确还原，24 次浏览器像素哈希校验通过。具体环境、数据和限制见 [验证报告](reports/VALIDATION.md)。

## 本地开发与演示

```sh
npm ci
npm test
npm run build
npm run demo:prepare
npm run demo
```

打开 `http://127.0.0.1:8081`，可调服务端发送速率、精度模式和执行位置。首次运行会准备原创程序绘制样本；已有语料不会被覆盖。无需访问开发者本机的图片目录。

构建发布包：`npm run release`；验证发布包：`npm run test:package`。更多测试、可选真实图片语料和发布流程见 [开发文档](docs/DEVELOPMENT.md)。

## 许可

[Apache-2.0](LICENSE)。Release 附带的程序绘制示例随项目提供；真实测试图片未随仓库或 Release 分发，仍受各自原始许可约束。

Decoder input accepts Uint8Array chunks from other JavaScript realms (for example iframe or embedded editor contexts). Wider typed arrays are rejected.

When `onFrame` is omitted, decoding validates all packets, checksums, coefficient signs and dependencies without reconstructing display pixels. Supply `onFrame` for image output.

CommonJS consumers use Node.js 20.19+ or 22.12+ synchronous ESM loading through the package require condition; the browser runtime remains ESM.
