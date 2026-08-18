#!/bin/bash
# git-deploy.sh — 从 GitHub 拉取最新代码并重新部署
# 用法：ssh 到服务器后执行 bash ~/timeview/git-deploy.sh
set -e
cd ~/timeview

echo ">>> 拉取最新代码..."
git pull origin main --ff-only

echo ">>> 重新构建 Docker 镜像..."
docker compose build --no-cache

echo ">>> 重启容器..."
docker stop timeview 2>/dev/null || true
docker rm timeview 2>/dev/null || true
docker compose up -d

echo ">>> 等待启动..."
sleep 3

echo ">>> 健康检查..."
curl -s http://127.0.0.1:8766/api/health | python3 -m json.tool 2>/dev/null || echo "health check failed"

echo ""
echo ">>> 完成！访问 https://timeview.site/timeview/"
