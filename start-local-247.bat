@echo off
REM Qarrib local 24/7 — PM2 manages backend as Windows service
setlocal
set "PROJ=%~dp0"
set "BACKEND=%PROJ%backend"

echo ============================================
echo  Qarrib 24/7 — PM2 Service Mode
echo ============================================
echo.

cd /d "%BACKEND%"

where pm2 >nul 2>nul
if %errorlevel% neq 0 (
  echo Installing PM2...
  call npm install -g pm2
)

echo Starting backend via PM2...
call pm2 kill >nul 2>&1
call pm2 delete qarrib-backend >nul 2>&1
call pm2 start ecosystem.config.js
call pm2 save

echo.
echo ============================================
echo  Backend: http://localhost:5000
echo  PM2 service: auto-restarts if crashed
echo  Laptop can be closed — processes keep running
echo ============================================
echo.
echo  Monitor: pm2 monit
echo  Stop all: pm2 delete all
echo.
pause