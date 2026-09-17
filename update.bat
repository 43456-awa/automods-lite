@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================
echo   automods-lite 更新
echo.
echo   只更新代码，下面这些原样保留：
echo     config.json   密钥与模型设置
echo     workspace/    你的工程
echo     chats/        对话记录
echo     usage.json    用量统计
echo ============================================
echo.

set "REPO=43456-awa/automods-lite"
set "BRANCH=main"
set "CORE=tools\update-core.ps1"

rem 老版本可能把 update.ps1 留在根目录，双击它会报一堆「不是内部或外部命令」。
rem 这里顺手清掉，免得再点错。
if exist "update.ps1" del /q "update.ps1" >nul 2>nul

rem 真正干活的是 tools\update-core.ps1（藏在子目录里，避免被误双击）。
rem 老版本没有这个文件，所以这里先自己拉一份。
if not exist "%CORE%" (
  echo 第一次运行，先取更新脚本 ...
  if not exist "tools" mkdir "tools" >nul 2>nul
  where curl.exe >nul 2>nul
  if errorlevel 1 (
    echo [错误] 系统里没有 curl.exe（Windows 10 1803 以上自带）。
    echo        手动打开下面地址，把内容另存为 tools\update-core.ps1 ：
    echo        https://raw.githubusercontent.com/%REPO%/%BRANCH%/tools/update-core.ps1
    echo.
    pause
    exit /b 1
  )
  curl -L --fail --silent --show-error --connect-timeout 15 --max-time 120 -o "%CORE%" "https://cdn.jsdelivr.net/gh/%REPO%@%BRANCH%/tools/update-core.ps1"
  if not exist "%CORE%" (
    curl -L --fail --silent --show-error --connect-timeout 15 --max-time 120 -o "%CORE%" "https://raw.githubusercontent.com/%REPO%/%BRANCH%/tools/update-core.ps1"
  )
  if not exist "%CORE%" (
    echo [错误] 下不到更新脚本，检查网络或开代理后重试。
    echo.
    pause
    exit /b 1
  )
  echo   取到了。
  echo.
)

where powershell >nul 2>nul
if errorlevel 1 (
  echo [错误] 找不到 powershell（Windows 自带，正常不该缺）。
  echo.
  pause
  exit /b 1
)

echo 提示：如果服务正在运行，建议先关掉那个窗口，避免文件被占用。
echo.
timeout /t 3 >nul

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0%CORE%"
set RC=%ERRORLEVEL%

echo.
if "%RC%"=="0" (
  echo 下一步：双击「启动.bat」重启服务，浏览器里 Ctrl+Shift+R 强刷一下。
) else (
  echo 更新没成功，上面有原因。修好网络后再双击一次这个文件。
)
echo.
pause
endlocal
exit /b %RC%
