@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   automods-lite 启动中...
echo ============================================

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 没有找到 Node.js
  echo 请先安装: https://nodejs.org/  选 LTS 版本
  echo 装完重新双击本文件
  pause
  exit /b 1
)

if not exist "boot.js" (
  echo [错误] 当前目录没有 boot.js
  echo 请把整个 automods-lite 文件夹解压完整，再双击本文件
  pause
  exit /b 1
)

echo 浏览器将打开: http://127.0.0.1:8787
echo 关闭本黑窗口 = 停止程序
echo.

start "" "http://127.0.0.1:8787"
node boot.js

echo.
echo 程序已退出。若刚才有报错，把窗口里的英文复制发给作者。
pause
