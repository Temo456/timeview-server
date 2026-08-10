#!/usr/bin/env bash
# 在服务器上一键部署（root 运行）。仅用 Node 内置模块，无需 npm install。
set -e
APPDIR=/opt/timeview
echo ">>> 安装 Node.js（如已安装会跳过）..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - || true
  (apt-get install -y nodejs || yum install -y nodejs) || true
fi
node -v || { echo "Node 安装失败，请手动安装 nodejs 后重跑"; exit 1; }

echo ">>> 部署应用到 $APPDIR ..."
mkdir -p "$APPDIR"
cp -f "$(dirname "$0")/index.html" "$APPDIR/"
cp -f "$(dirname "$0")/server.js" "$APPDIR/"
cp -f "$(dirname "$0")/knowledge.json" "$APPDIR/"

if [ ! -f "$APPDIR/timeview.env" ]; then
cat > "$APPDIR/timeview.env" <<ENV
PORT=80
# 如需 AI 对话，填入你的大模型 Key（OpenAI 兼容接口；DeepSeek/通义/OpenAI 等均可）
LLM_API_KEY=
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
ENV
fi

echo ">>> 配置 systemd 服务（开机自启、崩溃重启）..."
cat > /etc/systemd/system/timeview.service <<UNIT
[Unit]
Description=time-view
After=network.target
[Service]
WorkingDirectory=$APPDIR
EnvironmentFile=$APPDIR/timeview.env
ExecStart=/usr/bin/env node $APPDIR/server.js
Restart=always
[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable timeview >/dev/null 2>&1 || true
systemctl restart timeview
sleep 1
echo ">>> 完成！"
echo "    网页：   http://$(curl -s ifconfig.me 2>/dev/null || echo 服务器IP)/"
echo "    自检：   http://服务器IP/api/health"
echo ""
echo "如需开启 AI 对话：编辑 $APPDIR/timeview.env 填 LLM_API_KEY（及 BASE_URL/MODEL），"
echo "然后：systemctl restart timeview"
echo ""
echo "查看日志： journalctl -u timeview -f"
