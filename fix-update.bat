@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

rem ---------------------------------------------------------------
rem  One-time repair for OLD copies (0.3.x / 0.4.0).
rem
rem  Those versions ship an update.bat that overwrites ITSELF while
rem  running. cmd.exe parses a .bat by BYTE OFFSET, so the file
rem  changing under its feet shifts every following line, and each
rem  download lands in the WRONG filename (measured: server.js ended
rem  up 2.7 KB holding update.bat's text; learn.mjs got server.js).
rem  Running that old update.bat wrecks the copy.
rem
rem  This file has a DIFFERENT name, so nothing overwrites it while
rem  it runs. It fetches the real updater, checks it, and hands over.
rem  After one successful run the copy is current: it then has the
rem  new update.bat AND the in-app "update" button.
rem
rem  NOTE: keep this file ASCII-only. cmd.exe reads .bat with the
rem  system code page (GBK on CN Windows); UTF-8 Chinese gets
rem  mis-decoded and eats quotes/backslashes, so lines break into
rem  "not recognized" errors. All Chinese output comes from
rem  tools\update-core.ps1, which carries a UTF-8 BOM.
rem ---------------------------------------------------------------

echo ============================================
echo   automods-lite  one-time update fix
echo.
echo   For old copies that have no update button.
echo   This brings your copy up to the latest.
echo.
echo   Kept as-is:
echo     config.json    your api key / model
echo     workspace\     your projects
echo     chats\         conversations
echo     usage.json     usage stats
echo ============================================
echo.

set "REPO=43456-awa/automods-lite"
set "BRANCH=main"
set "CORE=tools\update-core.ps1"
rem jsDelivr caches @main for up to 12h. Measured: that copy of
rem tools/update-core.ps1 was the OLD one (Age 4h+), which computes the
rem project root with a single Split-Path and unpacks everything into
rem tools\ instead of updating. So prefer an immutable commit-pinned URL
rem and validate the content afterwards (see :checkcore).
set "PIN=a9f33b15a0c5b3b3f3ed76002968669573cb707e"

rem Old versions left update.ps1 in the root; double-clicking it breaks.
if exist "update.ps1" del /q "update.ps1" >nul 2>nul

if not exist "tools" mkdir "tools" >nul 2>nul

where powershell >nul 2>nul
if errorlevel 1 (
  echo [ERROR] powershell not found.
  echo.
  pause
  exit /b 1
)

where curl.exe >nul 2>nul
if errorlevel 1 (
  echo [ERROR] curl.exe not found.
  echo.
  pause
  exit /b 1
)

if not exist "%CORE%" (
  echo Fetching the update script ...
  curl -L --fail --silent --show-error --connect-timeout 15 --max-time 120 -o "%CORE%" "https://cdn.jsdelivr.net/gh/%REPO%@%PIN%/tools/update-core.ps1"
  call :checkcore
)
if not exist "%CORE%" (
  curl -L --fail --silent --show-error --connect-timeout 15 --max-time 120 -o "%CORE%" "https://cdn.jsdelivr.net/gh/%REPO%@%BRANCH%/tools/update-core.ps1"
  call :checkcore
)
if not exist "%CORE%" (
  curl -L --fail --silent --show-error --connect-timeout 15 --max-time 120 -o "%CORE%" "https://fastly.jsdelivr.net/gh/%REPO%@%BRANCH%/tools/update-core.ps1"
  call :checkcore
)
if not exist "%CORE%" (
  curl -L --fail --silent --show-error --connect-timeout 15 --max-time 120 -o "%CORE%" "https://raw.githubusercontent.com/%REPO%/%BRANCH%/tools/update-core.ps1"
  call :checkcore
)
if not exist "%CORE%" (
  echo [ERROR] Could not get a usable update script.
  echo         Check your network or turn on a proxy, then run this again.
  echo.
  pause
  exit /b 1
)

echo   ok
echo.
echo Updating now ...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0%CORE%"
set RC=%ERRORLEVEL%

echo.
if "%RC%"=="0" (
  echo Done.
  echo From now on: double-click update.bat,
  echo or use the "update" button inside the app.
) else (
  echo Update failed. See the messages above.
)
echo.
pause
endlocal
exit /b %RC%

rem ---------------------------------------------------------------
rem The downloaded updater must be validated. Two known failure modes:
rem   1) 0 bytes - curl failed but left an empty file; "if not exist"
rem                calls that success, PowerShell runs an empty script
rem                and reports OK without updating anything.
rem   2) old ps1 - computes the root with ONE Split-Path, so it unpacks
rem                the whole project into tools\ (jsDelivr @main lag).
rem Either way: delete it so the next mirror takes over.
rem ---------------------------------------------------------------
:checkcore
if not exist "%CORE%" exit /b 0
for %%F in ("%CORE%") do if %%~zF EQU 0 del /q "%CORE%" >nul 2>nul
if not exist "%CORE%" exit /b 0
findstr /C:"$scriptDir" "%CORE%" >nul 2>nul
if errorlevel 1 (
  del /q "%CORE%" >nul 2>nul
  echo   [warn] stale updater dropped, trying another mirror ...
)
exit /b 0
