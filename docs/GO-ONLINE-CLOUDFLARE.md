# Qarrib — Go ONLINE with Cloudflare Tunnel (Windows)

Your backend already serves **API + frontend on one port (`:5000`)**,
so one tunnel exposes everything. No code changes needed for going online.
The `CLIENT_URL` handling already allows `*` origin, and `api.js` auto-detects
the host, so the public `https://xxx.trycloudflare.com` URL just works.

## Option A — one click (recommended)

1. Double-click **`start-online.bat`** in the project root.
2. It will:
   - install `cloudflared` via `winget` if missing,
   - start the backend (`node src/server.js` on port 5000),
   - run `cloudflared tunnel --url http://localhost:5000`.
3. Copy the public URL it prints, e.g.
   `https://tunnel-abc-123.trycloudflare.com`
4. Open it on any phone/laptop — login as admin / nurse / patient.

> Keep both windows (backend + tunnel) open while demoing.

## Option B — manual (from https://try.cloudflare.com/#install)

1. Download **cloudflared for Windows** (64-bit `.exe`).
2. Start your backend:
   ```bat
   cd backend
   npm install
   node src/server.js
   ```
3. In another terminal:
   ```bat
   cloudflared tunnel --url http://localhost:5000
   ```
4. Share the `https://*.trycloudflare.com` URL.

## Notes / limits

- `trycloudflare.com` quick tunnels are **temporary** (URL changes each run, good for demos/tests).
- For a **fixed domain**, create a free Cloudflare account → Zero Trust → Tunnel → route `app.yourdomain.com` to `localhost:5000`.
- MongoDB stays local (`mongodb://127.0.0.1:27017`) — only HTTP is exposed, DB is not.
- If phones on the same Wi-Fi only (no internet), you can also just use `http://<your-lan-ip>:5000`.

## What changed in this update (flows you asked for)

1. **Patient creates request → notification to admin + nurses** (`orderFlow.createSimple` + socket `notification`/`new_order`).
2. **Nurse submits price → notification to admin + patient** (`order.submitOffer` + socket).
3. **Admin accepts nurse price → patient gets "Pay now" notification** (`POST /admin/orders/:orderId/approve-offer` + `POST /orders/:id/approve-offer`, admin button in `admin/orders.html` → عروض السعر/قبول).
4. **Wallet top-up via owner InstaPay number** (`OWNER_INSTAPAY_NUMBER` in `backend/.env`, patient `wallet.html` → admin `payments.html` → approve adds balance + notifies both sides + socket).
5. **Service confirmed → admin completes → nurse wallet credited** (`POST /admin/orders/:orderId/complete`, button in `admin/orders.html`).
6. **Nurse withdrawal → admin notification with payout number** — nurse saves `payoutAccount` in `nurse/wallet.html`, `POST /wallet/withdraw` notifies admins, admin reviews in `payments.html` → `GET/POST /admin/withdrawals`.
7. **Admin ↔ nurse chat (like nurse ↔ patient)** — admins can join any order chat (`chat.controller` + sockets allow `admin`), new pages `admin/chat.html` + `admin/chat-room.html`, chat list API `GET /chat/my-chats`, new-message notifications to all sides.
8. **Notification center** — `GET /notifications` (+`unreadCount`), `frontend/notifications.html`, `frontend/js/notifications.js` (badge `#notifBadge`, 30s polling + socket push), admin dashboard links.
