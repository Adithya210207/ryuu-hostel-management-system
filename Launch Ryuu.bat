@echo off
setlocal
title Ryuu - Laptop and Phone Server
pushd "%~dp0"
if errorlevel 1 goto folder_error

echo.
echo ============================================================
echo                     RYUU
echo                Laptop and phone preview
echo ============================================================
echo.
echo Connect your phone and laptop to the same Wi-Fi.
echo Your phone link will appear below when the server starts.
echo Laptop link: http://127.0.0.1:4174
echo.
echo Keep this window open and your laptop awake while using it.
echo To stop the server, press Ctrl+C and confirm if prompted.
echo Use demo data only - this is the local preview.
echo.

where node.exe >nul 2>&1
if errorlevel 1 goto missing_node
where npm.cmd >nul 2>&1
if errorlevel 1 goto missing_node
if not exist "node_modules\next\dist\bin\next" goto missing_dependencies

call npm.cmd run dev:phone
if errorlevel 1 goto launch_error
echo.
echo Ryuu has stopped. Double-click this file to start again.
goto finish

:missing_node
echo Node.js or npm was not found. Install Node.js 24, then reopen this file.
goto finish

:missing_dependencies
echo The app dependencies are missing.
echo Open a terminal in this folder and run: npm ci
echo Then double-click this file again.
goto finish

:launch_error
echo.
echo The preview could not start, or stopped with an error.
echo Check the message above.
echo If port 4174 is in use, the website may already be running.
echo Open the existing link, or stop its previous server window first.
echo If several network addresses are listed, run:
echo npm run dev:phone -- YOUR-WIFI-IP-ADDRESS
echo If your phone cannot connect, check the Wi-Fi firewall allowance.
goto finish

:folder_error
echo Could not open the Ryuu folder. Keep this file in the app folder.
pause
exit /b 1

:finish
echo.
popd
pause
endlocal
