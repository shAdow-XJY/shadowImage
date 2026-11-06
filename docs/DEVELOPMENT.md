# 开发与验证

Node.js 20+，推荐 Node.js 22。源码与网页运行时均为 ESM。

```sh
npm ci
npm test
npm run build
npm run demo:prepare
npm run demo
```

`demo:prepare` 只在缺少样本清单时生成原创程序绘制样本，不覆盖已有真实图片语料。演示地址为 `http://127.0.0.1:8081`。

## 真实图片语料

真实图片没有随仓库或 Release 分发。`experiments/corpus.json` 保存固定相对路径与 SHA-256；如果持有该语料，可以只读运行：

```sh
npm run corpus -- /path/to/corpus
npx playwright install
npm run test:browser
npm run test:browser:corpus
npm run test:cold
npm run report
```

所有图片生成物位于被 git 忽略的 `experiments/generated/`。尺寸规范化、精确还原和 alpha 校验由语料脚本执行。浏览器语料测试需要这 12 张样本，不能用单个程序示例代替。没有语料也可以运行单元测试、构建和 Release 包测试。

旧 `experiments/codec.js` 与 `demo/server.mjs` 是历史原型，不是当前正式入口。`npm run demo:legacy` 仅用于旧协议实验。

## 构建 Release

更新 `package.json`、lockfile 与对应的 `docs/releases/v<version>.md` 后：

```sh
npm test
npm run release
npm run test:package
```

`release/` 输出 npm tarball、浏览器 ZIP、SHA256SUMS 与发布说明。ZIP 包含原创程序绘制的码流示例，不使用第三方语料图片。GitHub Actions 对 main / PR 执行测试、构建和包校验，并保存 Actions artifacts。发布 GitHub Release 是单独步骤，不会自动发布到 npm registry。

当前检查目标包括 20 KiB gzip 运行时预算、协议边界、精确像素恢复、取消与重启、worker 回退、可安装包独立导入。浏览器与真机覆盖情况以 `reports/VALIDATION.md` 为准。
