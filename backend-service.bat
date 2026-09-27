@echo off
REM Qarrib Backend Service — starts PM2 ecosystem
setlocal
set "PROJ=%~dp0"
set "BACKEND=%PROJ%backend"

echo [1/3] Ensuring PM2 is installed...
where pm2 >nul 2>nul
if %errorlevel% neq 0 (
  call npm install -g pm2
)

echo [2/3] Starting backend via PM2 ecosystem...
cd /d "%BACKEND%"
call pm2 kill >nul 2>&1
call pm2 delete qarrib-backend >nul 2>&1
call pm2 start ecosystem.config.js
call pm2 save

echo [3/3] Done. http://localhost:5000
echo.
echo Run setup-autostart.bat for laptop-closed mode.
echo.
pause