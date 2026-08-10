@echo off
chcp 936 >nul
cd /d "%~dp0"
title 时间景观 - 本地构建 Docker 镜像
echo ============================================================
echo     在本机构建镜像，导出为 tar，上传到服务器载入即可
echo ============================================================
docker version >nul 2>nul
if errorlevel 1 goto nodocker
echo  [1/2] 构建镜像 timeview:latest（linux/amd64，适配云服务器）……
docker build --platform linux/amd64 -t timeview:latest .
if errorlevel 1 goto failed
echo  [2/2] 导出为 timeview-image.tar ……
docker save timeview:latest -o timeview-image.tar
echo.
echo  完成！已生成 timeview-image.tar （约 60~70MB）
echo ------------------------------------------------------------
echo  下一步（在 PowerShell 里执行，上传镜像和运行脚本）：
echo    scp "%cd%\timeview-image.tar" root@124.223.178.244:/root/timeview/
echo    scp "%cd%\服务器载入运行.sh"  root@124.223.178.244:/root/timeview/
echo  然后 SSH 到服务器执行：
echo    cd /root/timeview ^&^& bash 服务器载入运行.sh
echo ============================================================
pause
exit /b
:nodocker
echo  未检测到 Docker。请先安装并启动 Docker Desktop，再运行本脚本。
echo  下载： https://www.docker.com/products/docker-desktop/
pause
exit /b
:failed
echo  构建失败，请把上面的报错发我。
pause
