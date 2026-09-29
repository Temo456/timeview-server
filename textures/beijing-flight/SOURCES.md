# 北京升空开场素材与制作

## 底图与道路

- 北京城市近景（2.4–80 km）：EOxCloudless 2016，EOX IT Services GmbH，Contains modified Copernicus Sentinel data 2016；CC BY 4.0。服务说明 https://maps.eox.at/ ，图层 `s2cloudless_3857`。图像覆盖范围记录在 imagery.json。
- 区域、中国及世界底图：NASA Blue Marble，经 EOX WMS `bluemarble` 获取。https://maps.eox.at/
- 二至六环道路、北京中轴线地标坐标：© OpenStreetMap contributors，ODbL。https://www.openstreetmap.org/copyright 。2026-09-28 经公开 Overpass 服务查询，北京范围 39.5–40.45°N、115.7–117.15°E；仅保留主线道路，轮廓在 rings.json。
- 时间景观结尾：复用项目已有 earth-north-pole.png、earth_clouds.png。
- 渲染库：Three.js 0.160.0，MIT License，https://github.com/mrdoob/three.js 。许可见 three-LICENSE.txt。

## 近景动画重建

两张天安门近景由内置 image_gen 生成，用于虚拟镜头的艺术重建；不是实时卫星影像或测绘数据。片尾全程画面下方标明“近景为动画重建”。输入参考为上面署名的 EOX 2016 底图。

提示要求：保持北向上、俯视视角、天安门及长安街布局，细化金色屋顶、红墙、庭院、树木与铺地；第二张聚焦天安门城楼和金水桥，用于近距离开场。禁止界面文字、云层和水印。生成图保存在本目录 tiananmen-reconstruction.png 与 tiananmen-close.png。

## 动画

flight.js 是可复现的连续镜头；preview.html?render=1 提供 renderFlight(seconds)，用于逐帧导出。15 秒，60 fps。相机高度用对数域单调三次插值，速度连续；镜头从天安门升空，依次展示北京中轴线、二至六环、北京全域、中国、地球，再转至北极俯视图。

早期 4.0.15–4.0.17 使用本次制作的合成器和弦、节拍与升空音效。按用户要求，4.0.20 起北京与上海开场共用项目已有上海迪士尼视频的音轨，统一响度并在结尾淡出；该音轨不标为本项目原创。处理步骤见 `tools/opening/remix-city-intros.py`。电脑网页使用 720p/60 fps，手机使用 540p/30 fps；均为 H.264 / AAC、faststart，独立交付保留 1080p/60 fps。

4.0.16 为改善镜头连续性，在原近景图左侧等比例扩展一倍宽度，生成 tiananmen-wide.png（2:1）。保留原图右半部，在左侧重建西侧湖泊、街道与建筑。此部分同为艺术重建。近地渲染使用局部坐标消除浮点抖动；终场大陆方向与地球界面的开场姿态对齐。

4.0.17：240、800、2400、8000 km 的区域与全国底图改用 NASA Blue Marble（同上 EOX WMS bluemarble 数据）。以 EPSG:4326 下载，地理边界存入 imagery.json 的 bounds4326。移除原 EOX 2016 全国拼接影像的条带/方格色差。城市近景继续使用原 2016 数据。
