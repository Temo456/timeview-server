# iPhone 开场准备失败

## 已核实

用户明确报错为“开场动画未能准备好，请重新加载”，对应 preload.prepareVideo 的媒体加载错误/20s 超时，发生在进入地球之前；此前排查视图切换没有覆盖这条路径。

FFprobe 检查北京与上海的桌面/手机版：MP4、avc1 H.264、8 位 yuv420p、AAC-LC 48kHz 双声道；手机版 960×540，Main/High Level 3.1。四个文件的 moov 均位于 mdat 前，公网 SHA-256 与本地一致，bytes=0-1 返回正确的 206 和 Content-Range。没有证据表明文件容器/编码错误。

现有代码将完整缓存视频转成 Blob URL；Safari 在该路径发生元数据等待失败时，既删除正常缓存，又只提供整页重新加载。WebKit 有 Blob 媒体兼容性记录，但没有该用户实机日志，不能确认具体 iOS 缺陷版本。

## 实现

- Apple 触屏设备使用同源 HTTP 视频 URL。Service Worker 从现有预加载缓存响应完整及单 Range 请求，覆盖开放区间、后缀区间和 416；没有控制器时原生 HTTP 播放作为回退。
- 仍然在单一进度条下载课程、图像和两部视频，保留至少 5 秒的加载页；不把等待用户手势当作下载失败，也不因自动播放策略删除缓存。
- 媒体准备同时检查 readyState 与事件；超时但无媒体错误时显示“点击开始旅程”，在点击回调内直接 load/play，保留声音和 playsinline。
- 真正解码错误尝试正常 URL 回退，最终错误可以重试播放或手动进入已准备的地球页面；增加本地只读诊断区分传输、解码与手势等待。
- 用实际 MP4 验证有 Service Worker 的缓存分段播放、旧缓存升级和重播；用故障注入验证 Blob 不可用、无元数据直到手势、缓存不可用和解码错误。

发布测试环境 4.2.5，保留后台内容；实体 iPhone 的最终行为仍需要用户设备确认。

## 验证与发布

- `node --test tools/test-preload.cjs tools/test-movie-cache.cjs`：15 项通过，包含 5 秒加载下限、媒体手势等待、HTTP 回退、缓存 Range/HEAD/416 和环境隔离。
- `tools/test-intro-ios.cjs`：Chromium 与 Windows WebKit 均通过北京、上海实际 MP4 播放；注入 Blob 不可用后仍可从 HTTP 播放。手势等待与解码报错均可点击重试，并继续进入地球。
- 两个引擎的脚本请求均能在媒体源站不可用时获取缓存中的 206 响应。Chromium 原生播放器离线播放通过；Windows WebKit 原生播放器在本测试环境绕过 Service Worker，故不能据此声称 iPhone 离线播放已通过。
- 2026-09-30 已发布测试环境 4.2.5，镜像 `sha256:73aec9f1bd3a6e064c7fa5daa2310f80b0d0079f3565e3dcb0bd7a523a8f73f7`。课程 revision 27、184 条朗读音频及后台维护数据保留，正式环境容器未变更。
- 回退备份：`/root/timeview-backups/20260930-v425-test`；上一测试容器 `timeview-test-v4240` 保留为停止状态。
- 公网已有缓存的浏览器验证通过：实际开场播放、四次视图切换、双视图农历日期选择、前进后退；文档仅加载一次，朗读音频网络请求 0，页面脚本错误 0。首轮旧浏览器配置播放等待曾超时，未采集当时媒体状态，随后带诊断复测通过，不能据此声称已定位该次超时原因。
- 公网全新浏览器上下文再测通过：Chromium 和 Windows WebKit 均从零加载课程、音频与视频，媒体状态 `metadata-ready`，普通 HTTPS 视频地址，实际播放时间超过 0.3 秒，页面脚本错误 0；无需点击重试。记录位于工作区 `.deploy-check/v425-public-entry-result.json`。

不能从桌面浏览器自动化推断用户 iPhone 的具体系统缺陷；本次修复针对已核实的 Blob 播放路径和媒体错误处理缺陷，实际设备仍需复核。
