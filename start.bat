@echo off
cd /d "%~dp0"

echo ============================================
echo   automods-lite starting...
echo   Browser: http://127.0.0.1:8787
echo   Close this window to STOP the app.
echo ============================================

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js not found.
  echo Install LTS from https://nodejs.org/ then double-click this file again.
  echo.
  pause
  exit /b 1
)

if not exist "boot.js" (
  echo.
  echo [ERROR] boot.js not found in:
  echo %cd%
  echo.
  echo Extract the FULL automods-lite ZIP into one folder,
  echo put this bat INSIDE that folder, then run it again.
  echo.
  pause
  exit /b 1
)

start "" "http://127.0.0.1:8787"
node boot.js

echo.
echo Server stopped. If you saw an error above, copy it and send to the author.
pause
