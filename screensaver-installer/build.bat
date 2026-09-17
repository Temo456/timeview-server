@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === 构建时间景观屏保安装程序 ===
rem 1) 先把最新屏保复制为安装载荷
copy /y "..\screensaver\publish\时间景观.scr" "screensaver.scr" >nul
rem 2) 发布安装程序
dotnet publish -c Release -o publish -r win-x64 2>&1
if errorlevel 1 ( echo 构建失败 & pause & exit /b 1 )
del /q publish\*.pdb 2>nul
echo.
echo 完成！安装包：publish\时间景观屏保安装程序.exe
echo 双击运行即可（会请求管理员权限，自动复制到 System32 并注册屏保）。
echo.
pause
