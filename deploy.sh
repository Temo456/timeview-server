#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo ">>> 载入镜像 timeview-image.tar ..."
docker load -i timeview-image.tar
if [ ! -f timeview.env ]; then
cat > timeview.env <<ENV
# 大模型（OpenAI 兼容）。xAI/Grok 需要科学上网，已配合下面的 HTTPS_PROXY 使用。
LLM_API_KEY=
LLM_BASE_URL=https://api.x.ai/v1
LLM_MODEL=grok-4.3
# 走宿主机代理（用 --network host 后，127.0.0.1 即服务器本机回环）
# 若改用国内可直连的模型（DeepSeek/通义/智谱），把下面这行删掉或注释。
HTTPS_PROXY=http://127.0.0.1:7890
ENV
fi
mkdir -p data
docker rm -f timeview >/dev/null 2>&1 || true
echo ">>> 启动容器（--network host, PORT=8766, BIND=127.0.0.1, BASE_PATH=/timeview）..."
docker run -d --name timeview --restart always \
  --network host \
  -e PORT=8766 -e BIND=127.0.0.1 -e DATA_DIR=/data -e BASE_PATH=/timeview \
  --env-file timeview.env \
  -v "$(pwd)/data:/data" \
  timeview:latest
sleep 1
docker ps --filter name=timeview
echo ">>> 完成。访问 https://124.223.178.244/timeview/"
echo ">>> 自检 https://124.223.178.244/timeview/api/health  应 ai:true"
echo ">>> 看日志： docker logs --tail 50 timeview"
