#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
[ -f timeview.env ] || cp timeview.env.example timeview.env
mkdir -p data
if docker compose version >/dev/null 2>&1; then DC="docker compose"; else DC="docker-compose"; fi
echo ">>> 构建并启动容器（内部端口 127.0.0.1:8090）..."
$DC up -d --build
echo ">>> 完成。容器状态："
docker ps --filter name=timeview
echo ""
echo "下一步：把 nginx-timeview.conf 放到 /etc/nginx/conf.d/ 并改 server_name，"
echo "然后  nginx -t && systemctl reload nginx  即可通过你的域名访问。"
echo "如需 AI：编辑 timeview.env 填 LLM_API_KEY，再  $DC up -d  重启。"
