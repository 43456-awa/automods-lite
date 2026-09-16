@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================
echo   automods-lite repair / update
echo   Downloads missing files from mirrors.
echo   Your config.json will NOT be changed.
echo ============================================

set "REPO=43456-awa/automods-lite"
set "BRANCH=main"
set FAILED=0

rem Try mirrors in order (jsDelivr usually works in CN without proxy)
set "M1=https://cdn.jsdelivr.net/gh/%REPO%@%BRANCH%"
set "M2=https://fastly.jsdelivr.net/gh/%REPO%@%BRANCH%"
set "M3=https://raw.githubusercontent.com/%REPO%/%BRANCH%"

call :need curl.exe
if errorlevel 1 (
  echo [ERROR] curl.exe not found. Install Windows 10+ or Git for Windows.
  pause
  exit /b 1
)

call :get boot.js
call :get start.bat
call :get update.bat
call :get server.js
call :get learn.mjs
call :get updater.mjs
call :get memory.mjs
call :get package.json
call :get update.json
call :get config.example.json
call :get README.md

if not exist "public" mkdir "public"
call :get public/index.html
call :get public/style.css
call :get public/app.js
call :get public/learn.js
call :get public/checker.js

if not exist "content" mkdir "content"
call :get content/neoforge-chapters.js
call :get content/java-chapters.js

echo.
if not exist "memory.mjs" (
  echo [ERROR] memory.mjs is still missing.
  echo Your network may block GitHub. Turn on VPN/proxy and run this again.
  echo Or download the full ZIP from:
  echo   https://github.com/%REPO%
  set FAILED=1
)
if not exist "server.js" (
  echo [ERROR] server.js is missing.
  set FAILED=1
)

if "%FAILED%"=="1" (
  echo.
  echo [WARN] Some files failed. Check network and try again.
) else (
  echo.
  echo [OK] Files ready.
  echo Next: double-click start.bat
)

echo.
pause
endlocal
exit /b 0

:need
where %1 >nul 2>nul
exit /b %errorlevel%

:get
set "FILE=%~1"
echo   - %FILE%
set "OKFILE="
for %%M in (M1 M2 M3) do (
  if not defined OKFILE (
    call set "URL=%%%%M%%/%FILE%"
    curl -L --fail --silent --show-error --connect-timeout 12 --max-time 90 -o "%FILE%" "%URL%" 2>nul
    if not errorlevel 1 (
      if exist "%FILE%" set "OKFILE=1"
    )
  )
)
if defined OKFILE (
  echo     ok
) else (
  echo     FAILED %FILE%
  set FAILED=1
)
exit /b 0
