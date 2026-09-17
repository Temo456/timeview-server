@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === 构建时间景观屏保 (.scr，单文件自包含) ===
dotnet publish -c Release -o publish -r win-x64 2>&1
if errorlevel 1 ( echo 构建失败 & pause & exit /b 1 )
copy /y "publish\TimeViewScreensaver.exe" "publish\时间景观.scr" >nul
del /q publish\*.pdb publish\*.xml 2>nul
echo.
echo 完成！单文件屏保：publish\时间景观.scr（约 49MB，已内含渲染页面与依赖，无需额外文件）
echo.
echo 安装方式：
echo   1) 右键 publish\时间景观.scr → 安装（推荐，自动复制到系统并打开设置）
echo   2) 或把 时间景观.scr 复制到 C:\Windows\System32\（需管理员）
echo.
pause
