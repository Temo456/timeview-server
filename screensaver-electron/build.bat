@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === 构建时间景观屏保 Win7 版（Electron 22）===
if not exist node_modules (
  set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
  call npm install
)
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
call npx electron-packager . "时间景观屏保" --platform=win32 --arch=x64 --out=dist --overwrite --prune
if errorlevel 1 ( echo 构建失败 & pause & exit /b 1 )
cd "dist\时间景观屏保-win32-x64"
copy /y "时间景观屏保.exe" "时间景观.scr" >nul
del /q "时间景观屏保.exe" 2>nul
rmdir /s /q "resources\app\node_modules" 2>nul
echo.
echo 完成！屏保文件夹：dist\时间景观屏保-win32-x64\
echo 注意：整个文件夹是一个整体，.scr 与 resources\、*.dll 等必须保持同目录。
echo.
pause
