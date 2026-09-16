@echo off
cd /d "%~dp0"

echo ============================================
echo   automods-lite file repair / update
echo   This will download missing source files
echo   from GitHub. Your config.json is kept.
echo ============================================

where curl >nul 2>nul
if errorlevel 1 (
  where powershell >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] Need curl or PowerShell.
    pause
    exit /b 1
  )
)

set BASE=https://raw.githubusercontent.com/43456-awa/automods-lite/main
set FAILED=0

call :get boot.js
call :get start.bat
call :get server.js
call :get learn.mjs
call :get updater.mjs
call :get memory.mjs
call :get package.json
call :get update.json
call :get config.example.json
call :get README.md

echo.
echo Downloading public/ ...
if not exist "public" mkdir public
call :get public\index.html
call :get public\style.css
call :get public\app.js
call :get public\learn.js
call :get public\checker.js

echo Downloading content/ ...
if not exist "content" mkdir content
call :get content\neoforge-chapters.js
call :get content\java-chapters.js

if not exist "boot.js" (
  echo.
  echo [ERROR] boot.js missing after download.
  echo Please re-download the full ZIP from GitHub.
  pause
  exit /b 1
)

echo.
if "%FAILED%"=="1" (
  echo [WARN] Some files failed. Check network / proxy and run again.
) else (
  echo [OK] All key files updated.
)

echo.
echo Next: close this window, then double-click start.bat
echo.
pause
exit /b 0

:get
set FILE=%~1
set URL=%BASE%/%FILE:\=/%
echo   - %FILE%
where curl >nul 2>nul
if not errorlevel 1 (
  curl -L --fail --silent --show-error -o "%FILE%" "%URL%"
) else (
  powershell -NoProfile -Command "try { Invoke-WebRequest -Uri '%URL%' -OutFile '%FILE%' -UseBasicParsing } catch { exit 1 }"
)
if errorlevel 1 (
  echo     FAILED %FILE%
  set FAILED=1
) else (
  echo     ok
)
goto :eof
