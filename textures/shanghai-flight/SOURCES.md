# 上海迪士尼升空开场（4.2.13）

15 秒。0–8.25 秒为上海新镜头；8.25–8.9 秒在中国上空配准融合；8.9–15 秒复用北京 4.0.21 成片。完整音轨直接复用北京成片（其来源为项目既有上海视频的配乐），无拼接切断。

## 素材与声明

- 城堡、园区为 image_gen 生成的动画重建，不是实时航拍或测绘照片。画面保留“近景为动画重建”说明。
- 园区提示词：以上海迪士尼旧卫星底图为布局参考，生成北向上、近垂直俯视的完成态乐园，奇幻童话城堡居中，自然日光，不带文字、云层、水印；第二张生成相同位置和朝向的城堡近景，保持建筑、花园、水系不变，用于连续拉远。
- 两张近景经 SIFT/RANSAC 配准（308 对内点），矩阵及起点锚点记录在 registration.json。仅作为艺术重建的视觉对齐，不宣称地理测量精度。
- 城市底图：EOxCloudless 2016，EOX IT Services GmbH，Contains modified Copernicus Sentinel data 2016，CC BY 4.0。https://maps.eox.at/ 。不是当前年度影像；近地层显示的是旧版城市底图。
- 区域/中国底图：NASA Blue Marble，经 EOX WMS bluemarble。https://maps.eox.at/ 。下载范围与 URL 在 imagery.json。
- 中国后半段/世界底图及片尾、地球姿态复用北京版，原有素材与许可见 ../beijing-flight/SOURCES.md。
- 起点使用奇幻童话城堡约 121.6556832°E、31.1455449°N，路径与地名定位只用于动画。
- 字体：Noto Sans SC（SIL Open Font License 1.1），通过 OPENING_FONT 指向本地字体，未随应用分发。

## 重现

在仓库根目录运行 `python3 tools/opening/render-shanghai.py --font /path/to/NotoSansSC.ttf`。
依赖 Python numpy、opencv-python-headless、Pillow 以及 ffmpeg。读取仓库内图片和北京 intro-beijing-v421.mp4，不依赖在线地图或 WebGL。输出默认为 textures/intro-shanghai-v4213.mp4（1280×720，60 fps）。

相机高度在对数域做速度连续的单调三次插值；地表通过相机射线与球面求交，按地理投影采样各级影像。上海城市段保持北向上，在 5.8–8.25 秒之间逐步并入北京版中国镜头的位置和航向，再做 0.65 秒融合。后半段复用对应时刻的原始视频帧。

手机档由电脑版转为 960×540、30 fps、H.264 Main 3.1 / AAC 128k，最大视频码率 950k。两档保留 15 秒、faststart、YUV420P 和 BT.709 标签。
