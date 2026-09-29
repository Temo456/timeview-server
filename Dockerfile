FROM node:20-alpine
WORKDIR /app
# 仅用 Node 内置模块，无需 npm install
COPY server.js astro.js lunar.js knowledge.json index.html solar-system.html assistant.js card-layout.js course-visuals.js course-editor.js landing.html release.html wallpaper.html admin.html manifest.json sw.js timeview-wallpaper.apk ./
COPY textures/ textures/
COPY course-store.js course-default.json ./
COPY course-audio.js course-speech.js course-audio-client.js ./
COPY vendor/ vendor/
COPY three-body-model.js ./
COPY favicon.svg favicon.ico ./
COPY intro.js preload.js intro.css ./
COPY mobile.js mobile.css ./
COPY solar-gestures.js ./
COPY calendar-events.js calendar-terms.js ./
COPY sounds/ sounds/
ENV PORT=3000 DATA_DIR=/data
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "server.js"]
