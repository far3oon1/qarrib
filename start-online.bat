@echo off
REM Qarrib - Go Online with Cloudflare trycloudflare.com
REM Local MongoDB only. Laptop-closed ready.
setlocal
set "PROJ=%~dp0"
set "BACKEND=%PROJ%backend"
set "CLOUDFLARED_PATH=C:\Program Files\cloudflared"
set "PATH=%PATH%;%CLOUDFLARED_PATH%"

echo ============================================
echo  Qarrib Online — trycloudflare.com
echo  Local MongoDB | Laptop-Closed Ready
echo ============================================
echo.

cd /d "%BACKEND%"

where pm2 >nul 2>nul
if %errorlevel% neq 0 (
  echo Installing PM2...
  call npm install -g pm2
)

echo Starting backend via PM2...
call pm2 delete qarrib-backend >nul 2>&1
call pm2 start ecosystem.config.js
call pm2 save

echo Waiting for backend...
timeout /t 3 /nobreak >nul
:loop
curl -s http://localhost:5000/ >nul 2>&1
if errorlevel 1 (
  timeout /t 2 /nobreak >nul
  goto loop
)
echo Backend ready!

echo Starting Cloudflare trycloudflare tunnel...
cd /d "%PROJ%"
echo.
echo  Your public URL will appear below as:
echo  https://xxxx.trycloudflare.com
echo  Share this URL with nurses/patients.
echo  Keep this window open or run setup-autostart.bat
echo  for auto-start on boot.
echo.

cloudflared --edge-ip-version 4 tunnel --url http://localhost:5000

echo Tunnel dropped - reconnecting...
timeout /t 5 >nul
goto :loop

echo.
echo  Monitor: pm2 monit
echo  Logs: pm2 logs all
echo.
pause