@echo off
echo ============================================
echo  Qarrib Status Check
echo ============================================
echo.
pm2 list 2>nul
if %errorlevel% neq 0 (
  echo PM2 is not running. Run setup-autostart.bat first.
  goto :eof
)
echo.
echo Backend (http://localhost:5000):
curl -s http://localhost:5000/ >nul 2>&1 && (echo Backend is running) || (echo Backend is NOT responding)
echo.
echo Logs: pm2 logs all
echo.