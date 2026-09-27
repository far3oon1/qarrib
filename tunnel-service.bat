@echo off
REM Qarrib Tunnel Service — Cloudflare trycloudflare.com loop
setlocal
set "PROJ=%~dp0"
set "PATH=%PATH%;C:\Program Files\cloudflared;C:\Program Files (x86)\cloudflared"
set "CLOUDFLARED_PATH="

where cloudflared >nul 2>nul
if %errorlevel% equ 0 (
  set "CLOUDFLARED_PATH=C:\Program Files\cloudflared"
) else (
  set "CLOUDFLARED_PATH=C:\Program Files (x86)\cloudflared"
)
set "PATH=%PATH%;%CLOUDFLARED_PATH%"

where cloudflared >nul 2>nul
if %errorlevel% neq 0 (
  echo cloudflared not found. Installing...
  winget install -e --id Cloudflare.cloudflared --accept-source-agreements --accept-package-agreements
)

echo Cloudflare trycloudflare tunnel starting...
cd /d "%PROJ%"
:loop
cloudflared --edge-ip-version 4 tunnel --url http://localhost:5000
echo Tunnel dropped - reconnecting in 5s...
timeout /t 5 >nul
goto loop