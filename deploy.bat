@echo off
echo === TimeView Deploy ===
echo.

set SERVER=root@124.223.178.244
set REMOTE=~/timeview

echo [1/3] Uploading package...
scp timeview-deploy.tar.gz -p 2048   %SERVER%:%REMOTE%/
if errorlevel 1 goto :fail

echo [2/3] Uploading script...
scp deploy.sh -p 2048   %SERVER%:%REMOTE%/
if errorlevel 1 goto :fail

echo [3/3] Remote deploy...
ssh %SERVER% "bash %REMOTE%/deploy.sh"
if errorlevel 1 goto :fail

echo.
echo === Done ===
pause
exit /b 0

:fail
echo Deploy failed!
pause
exit /b 1
