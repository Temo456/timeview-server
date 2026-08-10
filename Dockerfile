FROM node:20-alpine
WORKDIR /app
# 仅用 Node 内置模块，无需 npm install
COPY server.js astro.js lunar.js knowledge.json index.html landing.html release.html wallpaper.html manifest.json sw.js icon-192.png icon-512.png icon-180.png qr.png timeview-wallpaper.apk wallpaper-qr.png ./
COPY textures/ textures/
COPY sounds/ sounds/
ENV PORT=3000 DATA_DIR=/data
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "server.js"]
