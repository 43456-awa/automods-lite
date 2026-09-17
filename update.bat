@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

rem ---------------------------------------------------------------
rem  NOTE: keep this file ASCII-only.
rem  cmd.exe parses .bat with the system code page (GBK on CN Windows).
rem  If this file contains UTF-8 Chinese, cmd mis-decodes it and eats
rem  quotes / backslashes, so lines break into "not recognized" errors.
rem  All Chinese output is done by tools\update-core.ps1 (which has a
rem  UTF-8 BOM, so PowerShell reads it correctly).
rem ---------------------------------------------------------------

echo ============================================
echo   automods-lite  update
echo.
echo   Code files will be updated.
echo   Kept as-is:
echo     config.json    api key / model
echo     workspace\     your projects
echo     chats\         conversations
echo     usage.json     usage stats
echo ============================================
echo.

set "REPO=43456-awa/automods-lite"
set "BRANCH=main"
set "CORE=tools\update-core.ps1"

rem Old versions left update.ps1 in the root; double-clicking it breaks.
if exist "update.ps1" del /q "update.ps1" >nul 2>nul

rem The real worker lives in tools\ so it can't be double-clicked by mistake.
if not exist "%CORE%" (
  echo First run: fetching the update script ...
  if not exist "tools" mkdir "tools" >nul 2>nul
  where curl.exe >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] curl.exe not found.
    echo         Download this file manually and save it as tools\update-core.ps1 :
    echo         https://raw.githubusercontent.com/%REPO%/%BRANCH%/tools/update-core.ps1
    echo.
    pause
    exit /b 1
  )
  curl -L --fail --silent --show-error --connect-timeout 15 --max-time 120 -o "%CORE%" "https://cdn.jsdelivr.net/gh/%REPO%@%BRANCH%/tools/update-core.ps1"
  if not exist "%CORE%" (
    curl -L --fail --silent --show-error --connect-timeout 15 --max-time 120 -o "%CORE%" "https://raw.githubusercontent.com/%REPO%/%BRANCH%/tools/update-core.ps1"
  )
  if not exist "%CORE%" (
    echo [ERROR] Could not download the update script.
    echo         Check your network or turn on a proxy, then run this again.
    echo.
    pause
    exit /b 1
  )
  echo   ok
  echo.
)

where powershell >nul 2>nul
if errorlevel 1 (
  echo [ERROR] powershell not found.
  echo.
  pause
  exit /b 1
)

echo Tip: close the running server window first, to avoid file locks.
echo.
timeout /t 3 >nul

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0%CORE%"
set RC=%ERRORLEVEL%

echo.
if "%RC%"=="0" (
  echo Done. Now double-click start.bat to restart, then press Ctrl+Shift+R in the browser.
) else (
  echo Update failed. See the messages above.
)
echo.
pause
endlocal
exit /b %RC%
