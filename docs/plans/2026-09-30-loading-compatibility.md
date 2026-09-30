# Loading Compatibility Implementation Plan

**Goal:** 加载页至少展示 5 秒；降低 iPhone 加载结束阶段的内存峰值，并兼容 Safari 的视频预加载策略。

**Architecture:** 保留单一资源进度条、完整资源下载与持久缓存。图片先缓存压缩文件，仅对当前视图的贴图限流解码；场景和音频准备完成后再准备视频。Apple 触屏设备等待视频 metadata，其余设备继续等待首帧。资源完成时间与最短展示时间共同控制进入。

**Tech Stack:** 原生 JavaScript、CacheStorage、HTMLMediaElement、Canvas / Three.js、Node.js、Playwright。

## 1. 明确加载完成条件

- 修改 `preload.js`：从加载页展示开始计时；下载/解码完成显示 100%；仅等待不足 5 秒的剩余时间；失败仍显示重试。
- 验证快速缓存、超过 5 秒的慢请求、错误分支和首次开场。

## 2. 降低准备阶段峰值

- 修改 `preload.js`：删除用于预热的重复 Image 解码；资源下载限流、图片解码限流；缓存命中直接读取 Blob；释放流式读取的临时 chunks。
- 当前地球的 3 张图仍在进入前解码并绘制；太阳系贴图在其场景初始化时解码。
- 音频和两座城市的视频仍全部加载到同一进度条并缓存。

## 3. Apple 视频兼容

- 修改 `preload.js`：Apple 触屏设备用 metadata 作为已下载视频的准备条件，避免依赖 iOS 不保证触发的 loadeddata；保留播放时的静音回退/点击有声播放。
- 修改 `intro.js`：开场淡出后清空视频源、释放视频 Blob URL，保留磁盘缓存供下次开场使用。
- 验证 metadata-only 模拟、iPad 桌面 UA、跳过与正常结束。

## 4. 验证和交付

- 添加可运行的加载流程回归检查；真实 Chromium 检查冷缓存、热缓存、慢加载和开场播放。
- Windows WebKit 检查界面和控制流程；其 MP3/MP4 解码能力不等同于 iPhone，不能替代真机验证。
- 版本更新为 4.1.6，先测试环境，核对后同步正式环境；保留两套后台维护数据和可回滚镜像。
- 当前观察能确认重复解码和预加载等待风险；没有 iPhone 崩溃日志，不将重载根因表述为已证实。
