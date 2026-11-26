@echo off
setlocal
title Ryuu - Private HTTPS Test
pushd "%~dp0"
if errorlevel 1 exit /b 1
node scripts\quick-tunnel.cjs
popd
pause
endlocal
