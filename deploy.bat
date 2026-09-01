@echo off
chcp 65001 >nul
echo === TimeView Deploy ===
echo.

set SERVER=root@124.223.178.244
set REMOTE_DIR=/root/timeview

echo [1/3] Creating package...
tar czf timeview-deploy.tar.gz server.js astro.js lunar.js knowledge.json index.html landing.html release.html wallpaper.html manifest.json sw.js timeview-wallpaper.apk textures sounds
if errorlevel 1 (
    echo Failed to create package!
    pause
    exit /b 1
)
echo Package created.

echo [2/3] Uploading to server...
scp -P 2048 timeview-deploy.tar.gz deploy.sh %SERVER%:%REMOTE_DIR%/
if errorlevel 1 (
    echo Upload failed!
    pause
    exit /b 1
)

echo [3/3] Deploying on server...
ssh -p 2048 %SERVER% "cd %REMOTE_DIR% && bash deploy.sh"
if errorlevel 1 (
    echo Deploy failed!
    pause
    exit /b 1
)

echo.
echo === Done ===
pause
