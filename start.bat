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

netstat -ano | findstr ":8787" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo 检测到后端已经开着，直接复用。
) else (
  echo 启动后端服务（会开一个窗口，别关它）...
  start "通事 Agent" cmd /k "node server\agent.mjs"
)

echo 等待后端就绪...
node -e "const t=Date.now();const i=setInterval(async()=>{try{const r=await fetch('http://localhost:8787/api/health');if(r.ok){clearInterval(i);console.log('后端已就绪');process.exit(0)}}catch(e){}if(Date.now()-t>12000){clearInterval(i);console.log('后端启动超时');process.exit(1)}},400)"

if errorlevel 1 (
  echo.
  echo 后端没起来。看一眼「通事 Agent」那个窗口里报了什么错。
  echo 常见原因：8787 端口被别的程序占用，或者 node 版本太旧。
  pause
  exit /b 1
)

echo 启动前端，浏览器会自动打开...
call npm run dev
pause
