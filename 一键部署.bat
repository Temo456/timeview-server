@echo off
chcp 936 >nul
cd /d "%~dp0"
title 时间景观 - 一键构建并部署
set IP=124.223.178.244
set SSHPORT=2048
set USER=root
echo ============================================================
echo     一键：本机构建镜像 -^> 上传 -^> 服务器载入运行
echo     目标： %USER%@%IP%  端口 %SSHPORT%
echo     过程中可能要输 2~3 次服务器密码（配了 SSH 密钥则免输）
echo ============================================================
docker version >nul 2>nul
if errorlevel 1 goto nodocker
echo  [1/5] 构建镜像（linux/amd64）……
docker build --platform linux/amd64 -t timeview:latest .
if errorlevel 1 goto failed
echo  [2/5] 导出 timeview-image.tar ……
docker save timeview:latest -o timeview-image.tar
if errorlevel 1 goto failed
echo  [3/5] 确保服务器目录存在……
ssh -p %SSHPORT% %USER%@%IP% "mkdir -p ~/timeview"
echo  [4/5] 上传镜像与部署脚本……
scp -P %SSHPORT% timeview-image.tar %USER%@%IP%:~/timeview/
if errorlevel 1 goto failed
scp -P %SSHPORT% deploy.sh %USER%@%IP%:~/timeview/
if errorlevel 1 goto failed
echo  [5/5] 远程载入并运行容器……
ssh -p %SSHPORT% %USER%@%IP% "cd ~/timeview && bash deploy.sh"
if errorlevel 1 goto failed
echo.
echo ============================================================
echo  完成！访问  https://%IP%/timeview/
echo  自检      https://%IP%/timeview/api/health
echo ============================================================
pause
exit /b
:nodocker
echo  未检测到 Docker，请先启动 Docker Desktop。
pause
exit /b
:failed
echo  某步失败，请把上面的报错发我。
pause
