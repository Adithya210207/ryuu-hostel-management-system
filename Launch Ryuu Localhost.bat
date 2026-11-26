@echo off
setlocal
title Ryuu - Localhost
pushd "%~dp0"
if errorlevel 1 goto folder_error

echo.
echo ============================================================
echo                  RYUU - LOCALHOST
echo ============================================================
echo.
echo Open this link after the server says Ready:
echo http://127.0.0.1:4174
echo.
echo Keep this window open while using the website.
echo Press Ctrl+C to stop the server.
echo.

where node.exe >nul 2>&1
if errorlevel 1 goto missing_node
where npm.cmd >nul 2>&1
if errorlevel 1 goto missing_node
if not exist "node_modules\next\dist\bin\next" goto missing_dependencies

call npm.cmd run dev
if errorlevel 1 goto launch_error
echo.
echo Ryuu has stopped. Double-click this file to start again.
goto finish

:missing_node
echo Install Node.js 24, then reopen this launcher.
goto finish

:missing_dependencies
echo Open a terminal in this app folder and run: npm ci
echo Then double-click this launcher again.
goto finish

:launch_error
echo.
echo Check the error above. If port 4174 is already in use,
echo Ryuu may already be running at http://127.0.0.1:4174
echo Use that link, or stop the previous launcher before restarting.
goto finish

:folder_error
echo Could not open the app folder. Keep this file in the Ryuu folder.
pause
exit /b 1

:finish
echo.
popd
pause
endlocal
