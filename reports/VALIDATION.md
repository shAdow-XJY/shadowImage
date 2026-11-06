# 实施与验证报告

## 当前结论

SHP2 已实现为可试用的独立库：整数 5/3 小波、全图位平面渐进、无损 RGB/RGBA、有损颜色且完整 alpha、块校验、真实 HTTP 流、可取消播放器、可选 Worker。网页运行时零第三方依赖；编码工具独立。旧 SHP1 保留不变。

默认采用小波候选：12 张真实样本在 16/32/64 三种基础尺寸下全部精确还原，32 模式提供 32–45 个编码检查点，比原预测层级提供更细的展示机会。真实网络下也观察到多个实际展示阶段；检查点数量不是实际帧率。基础尺寸默认 32，兼顾轮廓和首包；16 与 64 可选。轮廓判断来自生成图的人工视觉检查，不是普适可辨识度指标。文字、细线和透明边缘早期仍会模糊或振铃。

## 体积与算法调整

- 网页入口：12387 bytes，gzip 4772 bytes。
- 可选 Worker：gzip 3106 bytes；含 Worker 总计 **7878 bytes gzip**，低于 20 KiB 预算。
- 独立编码器：gzip 1797 bytes，不由网页入口引用。
- 先测试 varint、零游程、Rice，再加入“Rice 零游程 + 符号位”的三值块编码。相对前三种自适应表示，真实样本总码流由 9326301 降至 6047351 bytes，减少 35.2%；逐图减少 27.3%–45.4%。基础层大小未变。
- corpus-results.json 的 varintEquivalent 是同一小波位平面的纯 varint 对照，不是旧 SHP1，也不是其他图片格式。predictiveBaseline 是 RGB 预测残差参考，未计 alpha，不能用来宣称同画质压缩率优胜。

## 真实图片结果

来源只读；固定路径与 SHA256 在 experiments/corpus.json。输出保存于 experiments/generated/，不会修改外部项目。样本转为 sRGB RGBA、最长边不超过 768；精确还原指此像素输入，不是原始文件字节或未经缩放的原图。11-transparent-icons 有实际透明像素；其他部分名称含 transparent 的 UI 素材有 alpha 通道但像素实际不透明。

| 样本 | 实验尺寸 | 基础层累计 bytes | 完整 bytes | 编码检查点 |
|---|---|---:|---:|---:|
| 01-game-screenshot | 768×480 | 1774 | 520616 | 40 |
| 02-text-card | 768×403 | 1620 | 181801 | 44 |
| 03-line-art | 400×733 | 1570 | 287282 | 45 |
| 04-transparent-interface | 614×768 | 2176 | 432873 | 43 |
| 05-illustration | 480×270 | 2554 | 378836 | 34 |
| 06-night-sky | 300×420 | 2409 | 249924 | 32 |
| 07-library-photo | 600×600 | 1749 | 597329 | 40 |
| 08-portrait-photo | 600×600 | 1789 | 510842 | 42 |
| 09-landscape-photo | 400×400 | 3078 | 293868 | 33 |
| 10-transparent-board | 614×768 | 2431 | 531281 | 44 |
| 11-transparent-icons | 768×576 | 2128 | 995157 | 44 |
| 12-comic | 512×768 | 1809 | 1067542 | 42 |

每张图生成 base16/base32/base64 预览与四个阶段 PNG。默认解码器全部输出；播放器合并过密更新。每个真实样本还验证 omitBits=2 时 alpha 完全相同。

## 浏览器与网络

独立浏览器上下文、localhost HTTP 服务按 256 KiB/s 分段发送、02-text-card 样本。下表从 start() 计时，包含 Worker 初始化，不含页面预先加载入口模块的时间，未模拟真实互联网 RTT 或手机 CPU。测试覆盖至少四个阶段截图、主线程、Worker、取消重启、Worker 启动失败回退与移动宽度布局。

| 浏览器/引擎 | 状态 | 第一幅全图 | 完整加载 | 实际显示阶段 | 主线程最大解码片段 |
|---|---|---:|---:|---:|---:|
| chromium 140.0.7339.186 | passed | 82 ms | 867 ms | 9 | 8.8 ms |
| firefox | unavailable | — | — | — | — |
| webkit 26.0 | passed | 119 ms | 917 ms | 8 | 9.0 ms |
| edge 156.0.4314.58 | passed | 130 ms | 897 ms | 10 | 8.8 ms |
| chrome | unavailable | — | — | — | — |

另行冷启动测试在全新上下文的空白测试页动态导入运行时，从 import 前开始计时，覆盖入口获取/编译和 Worker 初始化：chromium 首幅 71ms，完整 866ms；edge 首幅 264ms，完整 906ms；webkit 首幅 114ms，完整 950ms。本地演示服务器没有 gzip，gzip 数字为构建产物测量；这不是广域网冷启动预测。原始记录见 cold-start.json。

Firefox 当前测试二进制启动失败（spawn UNKNOWN）；Chrome 正式版未安装。Chromium 测试版通过不等于 Chrome 所有版本通过。Windows WebKit 通过不等于 Safari 真机通过。Safari、iOS Safari、Android Chrome 与内嵌 WebView **未验证**；移动视口仅证明布局，不证明真机性能。

浏览器逐像素验证：24 次（12 样本 × 主线程/Worker），原始解码 RGBA 的 SHA256 与离线输入一致。Canvas 可能预乘 alpha，因此验证使用解码器输出而非 Canvas 回读。

8ms 是调度目标，存在超标；不是硬实时承诺。浏览器语料测试最大片段 9.1ms。performance.memory 仅为主线程 JS heap 的采样，不能代表 Worker、Canvas、GPU 或进程总峰值；该轮最大观测 10000000 bytes。Long Tasks 的支持状态独立记录；不支持时不能将空列表解释为零长任务。

## 自动化与边界

13 项 Node 测试通过：奇数/单行/单列/RGB/RGBA、单字节与不同分块、熵编码、错误版本/校验/顺序/长度、截断、超限、取消、重复启动、无响应流回退。corpus 命令逐图 assert 精确还原和 alpha；browser-corpus 逐图检查像素哈希。

后续重点是原始大尺寸与低端手机、多个并行图片的内存/调度、色彩管理和更多视觉样本。当前默认上限 4 百万像素；最坏工作内存远高于压缩文件体积。无响应流回退会完整下载，明确报告非渐进；未知长度时 arrayBuffer 分配不受解析器缓冲上限控制。协议仍为实验版本，不承诺长期存档兼容。不以其他图片格式的优劣作为项目成立条件。
