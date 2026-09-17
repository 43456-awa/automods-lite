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

if not exist "update.ps1" (
  echo [错误] 找不到 update.ps1。
  echo        它和 update.bat 必须放在同一个目录里。
  echo        重新从 GitHub 下完整 ZIP 解压覆盖一次即可。
  echo.
  pause
  exit /b 1
)

where powershell >nul 2>nul
if errorlevel 1 (
  echo [错误] 找不到 PowerShell（Windows 自带，正常不该缺）。
  echo.
  pause
  exit /b 1
)

echo 提示：如果服务正在运行，建议先关掉那个窗口，避免文件被占用。
echo.
timeout /t 3 >nul

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1"
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
