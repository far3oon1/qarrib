# Qarrib — Stay ONLINE 24/7

## Local Mode — Works when laptop is closed

Run `setup-autostart.bat` **as Administrator** once. This installs PM2 as a
Windows service so the backend keeps running even when you close your lid.

1. Make sure MongoDB is running locally (it's installed on your machine).
2. Run `setup-autostart.bat` as Administrator.
3. Done. Close the laptop — the service keeps running on system boot.

## Online Mode — Public URL via trycloudflare.com

Run `start-online.bat` to get a public URL using Cloudflare trycloudflare.
No account needed. No credit card.

1. Make sure backend is running: `pm2 start ecosystem.config.js`
2. Run `start-online.bat`
3. Your public URL appears as: `https://xxxx.trycloudflare.com`
4. Share it with nurses/patients.

## Database

- **Default:** Local MongoDB at `mongodb://127.0.0.1:27017/qarrab_db`
- No cloud MongoDB dependency. Everything runs locally.
- To change, edit `backend/.env` and set `MONGODB_URI`.

## Files overview

| File | Purpose |
|------|---------|
| `setup-autostart.bat` | Install PM2 as Windows service (auto-start on boot) |
| `start-local-247.bat` | Start backend via PM2 manually |
| `start-online.bat` | Start backend + trycloudflare tunnel for public URL |
| `start-server.bat` | Old method (window must stay open) |
| `backend-service.bat` | Quick service setup helper |
| `tunnel-service.bat` | Cloudflare tunnel auto-reconnect loop |
| `check-status.bat` | Check backend status |
| `ecosystem.config.js` | PM2 process configuration |

## Quick Start

```bat
REM Local mode (laptop can be closed)
setup-autostart.bat

REM Online mode (trycloudflare public URL)
start-online.bat

REM Check status
check-status.bat
```

## Notes

- trycloudflare URLs are temporary — they change each session
- For a permanent URL, create a Cloudflare account and save the tunnel
- Uploads: local `uploads/` — set Cloudinary env vars for permanent storage
- `backend/.env` — configure `MONGODB_URI` to use a different database