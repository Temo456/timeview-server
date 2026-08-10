@echo off
chcp 936 >nul
cd /d "%~dp0"
title 时间景观 - 本地试运行（含问答）
echo ============================================================
echo     本地启动 http://localhost:8080/   （Ctrl+C 停止）
echo     根目录部署模式：首页在 /，应用在 /app，接口在 /api
echo ============================================================
REM 读取 timeview.env 里的 LLM_* 配置（# 开头为注释）
if exist timeview.env (
  for /f "usebackq eol=# tokens=1,* delims==" %%a in ("timeview.env") do set "%%a=%%b"
)
set PORT=8080
set BASE_PATH=
echo  AI Key 是否已加载： %LLM_API_KEY:~0,6%...
echo  （没填 Key 时，💬 只返回知识库匹配文本，可先验证模块是否打通）
start "" http://localhost:8080/
node server.js
pause
