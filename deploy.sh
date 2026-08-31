#!/bin/bash
set -e
cd ~/timeview
echo ">>> Extracting..."
tar xzf timeview-deploy.tar.gz --overwrite
echo ">>> Building Docker..."
docker compose build --no-cache
echo ">>> Restarting..."
docker stop timeview 2>/dev/null || true
docker rm timeview 2>/dev/null || true
docker compose up -d
sleep 3
echo ">>> Health check..."
curl -s http://127.0.0.1:8766/api/health
echo ""
echo ">>> Done! Visit https://timeview.site/timeview/"
