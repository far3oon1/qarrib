@echo off
REM Qarrib — 24/7 Setup: Windows Service (runs when laptop closed)
REM Run as Administrator.
setlocal
set "PROJ=%~dp0"
set "BACKEND=%PROJ%backend"
set "DUMP=%USERPROFILE%\.pm2\dump.pm2"

echo ============================================
echo  Qarrib — Laptop Closed Mode Setup
echo ============================================
echo.
echo Creating Windows Services so backend + tunnel
echo keep running when you close the lid or log off.
echo.

echo [1/4] Ensuring PM2 is installed...
where pm2 >nul 2>nul
if %errorlevel% neq 0 (
  call npm install -g pm2
)

echo [2/4] Starting backend + tunnel via PM2...
cd /d "%BACKEND%"
call pm2 kill >nul 2>&1
call pm2 delete qarrib-backend >nul 2>&1
call pm2 delete qarrib-tunnel >nul 2>&1
call pm2 start ecosystem.config.js
call pm2 save

echo [3/4] Setting up PM2 dump for service...
if not exist "%USERPROFILE%\.pm2" mkdir "%USERPROFILE%\.pm2"
if exist "%DUMP%" (
  echo Dump ready at %DUMP%
)

echo [4/4] Creating Windows Services...
sc stop QarribBackend >nul 2>&1
sc stop QarribTunnel >nul 2>&1
timeout /t 2 /nobreak >nul
sc delete QarribBackend >nul 2>&1
sc delete QarribTunnel >nul 2>&1

echo @echo off > "%USERPROFILE%\.pm2\qarrib-resurrect.bat"
echo pm2 resurrect >> "%USERPROFILE%\.pm2\qarrib-resurrect.bat"
echo pm2 save >> "%USERPROFILE%\.pm2\qarrib-resurrect.bat"
echo exit /b 0 >> "%USERPROFILE%\.pm2\qarrib-resurrect.bat"

echo @echo off > "%USERPROFILE%\.pm2\qarrib-tunnel.bat"
echo cd /d "%PROJ%" >> "%USERPROFILE%\.pm2\qarrib-tunnel.bat"
echo call tunnel-service.bat >> "%USERPROFILE%\.pm2\qarrib-tunnel.bat"
echo exit /b 0 >> "%USERPROFILE%\.pm2\qarrib-tunnel.bat"

sc create QarribBackend binPath= "cmd /c %USERPROFILE%\.pm2\qarrib-resurrect.bat" start= auto DisplayName= "Qarrib Backend Service"
sc description QarribBackend "Qarrib backend - auto-starts on Windows boot"
sc start QarribBackend >nul 2>&1

sc create QarribTunnel binPath= "cmd /c %USERPROFILE%\.pm2\qarrib-tunnel.bat" start= auto DisplayName= "Qarrib Tunnel Service"
sc description QarribTunnel "Qarrib Cloudflare tunnel - auto-reconnects"
sc start QarribTunnel >nul 2>&1

echo.
echo ============================================
echo  DONE! Qarrib now runs 24/7 as Windows Services.
echo  - Backend & tunnel start automatically on boot
echo  - Survive laptop lid close / sleep / log off
echo  - http://localhost:5000
echo ============================================
echo.
echo  Monitor:   pm2 monit
echo  Logs:      pm2 logs all
echo  Stop:      net stop QarribBackend ^& net stop QarribTunnel
echo  Remove:    sc delete QarribBackend ^& sc delete QarribTunnel
echo.
pause