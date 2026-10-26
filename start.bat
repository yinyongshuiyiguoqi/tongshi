@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 没有找到 Node.js，请先安装：https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo 首次运行，正在安装依赖...
  call npm install
  if errorlevel 1 (
    echo 依赖安装失败，检查一下网络。
    pause
    exit /b 1
  )
)

echo 启动 Agent 服务（新窗口，日志在那里面看）...
start "通事 Agent" cmd /k "node server\agent.mjs"

timeout /t 1 >nul

echo 启动前端，浏览器会自动打开...
call npm run dev
pause
