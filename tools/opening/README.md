# 北京升空开场

当前成片为 15 秒，独立交付为 1080p/60 fps。电脑网页使用 720p/60 fps；手机、触摸设备和低速网络使用 540p/30 fps。两档均为 H.264/AAC、有限范围 YUV420P，保留同一镜头和声音。

在工作区根目录运行（`server` 的上一层）：

1. 用 Python 运行 `server/tools/opening/remix-city-intros.py`。
2. 在另一个终端为 `server/server.js` 设置 `PORT=8767`、`BIND=127.0.0.1` 和独立 `DATA_DIR`，启动本地服务。
3. 运行 `node server/tools/opening/render-movie.cjs`。默认使用 `.deploy-check/node_modules/playwright`，可用 `PLAYWRIGHT_MODULE` 指定其他安装位置。输出 `deliverables/timeview-beijing-ascent-15s-v421-1080p.mp4`。
4. 生成两档网页版（`faststart` 将元数据置于文件头，可边下载边播放）：

```sh
ffmpeg -y -hide_banner -i deliverables/timeview-beijing-ascent-15s-v421-1080p.mp4 -vf "scale=1280:720:in_range=tv:out_range=tv,format=yuv420p" -c:v libx264 -profile:v high -level:v 3.2 -crf 25 -maxrate 2800k -bufsize 2800k -preset medium -g 60 -c:a copy -t 15 -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 -movflags +faststart server/textures/intro-beijing-v421.mp4

ffmpeg -y -hide_banner -i deliverables/timeview-beijing-ascent-15s-v421-1080p.mp4 -i server/textures/intro-beijing-v420-mobile.mp4 -map 0:v:0 -map 1:a:0 -vf "fps=30,scale=960:540:in_range=tv:out_range=tv,format=yuv420p" -c:v libx264 -profile:v main -level:v 3.1 -crf 25 -maxrate 950k -bufsize 950k -preset slow -g 30 -keyint_min 30 -sc_threshold 0 -refs 2 -bf 2 -c:a copy -t 15 -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 -movflags +faststart server/textures/intro-beijing-v421-mobile.mp4
```

画面在 `textures/beijing-flight/flight.js` 中可复现。素材许可及近景重建说明见该目录 `SOURCES.md`。`make-score.py` 和 `make-score-15s.py` 保留旧版合成配乐的生成方法。4.0.20 起使用已有上海片的配乐，响度统一为约 -16 LUFS；`remix-city-intros.py` 提取的 WAV 也是重渲染的输入。

网页到达阶段按视频实际时长缩放。片尾北极图旋转为 165°，与主界面开场锁定的 180° 经线相匹配；淡出时启动被视频覆盖的地球绘制，结束后平滑回到当前时刻。

4.0.18 起，`preload.js` 和 `intro.css` 提供统一加载屏：完整下载所选视频、地球南北极、月亮和卫星图标，等待图片解码、课程与界面初始化以及地球首帧绘制，然后才播放。视频使用 Blob URL，片中不再请求视频分段；开场结束或跳过后直接显露同页地球。首次从太阳系入口打开开场时，先转到地球页面准备，避免片尾再次跳页。

缓存按部署路径和版本隔离，成功资源可复用于重播和重试；失败时提供重新加载按钮，进度在首帧完成之前最多显示 99%。地球主界面使用同分辨率 WebP，失败时回退原 PNG。星空旅行的 Three.js 仍在进入该视图时加载。

4.0.21 北京段以中轴线作为画面上方，天安门近景同步配准。前 6.2 秒固定航向，离开北京后才平滑过渡到既有地球镜头。两档成片和封面使用新文件名，避免旧缓存覆盖新版。
