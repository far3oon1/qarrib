@echo off
cd /d "%~dp0backend"
echo ============================================
echo  Qarrib backend (OLD method - window must stay open)
echo  Use setup-autostart.bat for laptop-closed mode
echo ============================================
echo  App: http://localhost:5000
echo  Admin: admin@qarrab.com / admin123
echo ============================================
node src/server.js
pause