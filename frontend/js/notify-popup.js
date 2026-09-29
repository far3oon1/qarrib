// Qarrib global notify popup — social-media style alerts on ANY platform.
// Web + desktop + Android/iOS (Capacitor): slide-in card, bell ring (WebAudio,
// no external file), vibration, badge + polling + socket push.
// Include AFTER api.js + auth.js on every dashboard/track page:
//   <script src="../js/notify-popup.js?v=1"></script>
// Works alongside the legacy notifications.js (no conflict).
(function () {
  'use strict';
  var POLL_MS = 20000;
  var lastSeenId = null;
  var audioCtx = null;
  var enabled = true;

  function isNative() {
    try {
      return (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) || !!window.QarrabMobileNative;
    } catch (e) { return false; }
  }

  // Best "social bell": bright two-tone chime synthesized with WebAudio.
  // No mp3 needed -> works offline, on iOS/Android WebView and desktop.
  function ringBell() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var t = audioCtx.currentTime;
      // Bell-like: fundamental + harmonic, two strikes (ding-ding)
      [[0, 880, 0.22], [0.18, 1174.66, 0.28], [0.36, 880, 0.2]].forEach(function (n) {
        var off = n[0], freq = n[1], dur = n[2];
        [1, 2.01, 2.74].forEach(function (mult, i) {
          var osc = audioCtx.createOscillator();
          var gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq * mult;
          var vol = [0.28, 0.1, 0.05][i];
          gain.gain.setValueAtTime(0.0001, t + off);
          gain.gain.exponentialRampToValueAtTime(vol, t + off + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + off + dur);
          osc.connect(gain); gain.connect(audioCtx.destination);
          osc.start(t + off); osc.stop(t + off + dur + 0.05);
        });
      });
    } catch (e) {}
  }

  function vibrate() {
    try {
      if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    } catch (e) {}
  }

  function ensureStyles() {
    if (document.getElementById('qp-notify-styles')) return;
    var s = document.createElement('style');
    s.id = 'qp-notify-styles';
    s.textContent = [
      '#qp-stack{position:fixed;top:calc(64px + env(safe-area-inset-top,0px));inset-inline-end:12px;z-index:99998;display:flex;flex-direction:column;gap:10px;max-width:min(360px,calc(100vw - 24px));}',
      '.qp-card{background:#fff;border:1px solid #D9D3C5;border-inline-start:5px solid #0B5F5A;border-radius:16px;box-shadow:0 12px 32px rgba(11,95,90,.25);padding:12px 14px;display:flex;gap:10px;align-items:flex-start;animation:qp-in .35s cubic-bezier(.2,.9,.3,1.2);cursor:pointer;font-family:inherit}',
      '.qp-card.order{border-inline-start-color:#0B5F5A}.qp-card.payment{border-inline-start-color:#2563eb}.qp-card.system{border-inline-start-color:#f59e0b}',
      '.qp-bell{width:40px;height:40px;border-radius:20px;background:#0B5F5A;color:#fff;display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0;animation:qp-ring .8s ease-in-out}',
      '.qp-card.payment .qp-bell{background:#2563eb}.qp-card.system .qp-bell{background:#b45309}',
      '.qp-title{font-weight:800;font-size:14px;color:#14302E}.qp-msg{font-size:13px;color:#4A605E;margin-top:2px;line-height:1.5}.qp-act{font-size:12px;color:#0B5F5A;font-weight:700;margin-top:4px}',
      '@keyframes qp-in{from{transform:translateY(-16px) scale(.96);opacity:0}to{transform:none;opacity:1}}',
      '@keyframes qp-ring{0%,100%{transform:rotate(0)}20%{transform:rotate(14deg)}40%{transform:rotate(-12deg)}60%{transform:rotate(8deg)}80%{transform:rotate(-6deg)}}',
      '.qp-out{animation:qp-out .3s ease-in forwards}@keyframes qp-out{to{transform:translateX(30px);opacity:0}}',
      '#qp-enable{position:fixed;bottom:calc(84px + env(safe-area-inset-bottom,0px));inset-inline-start:12px;z-index:99998;border:0;border-radius:999px;padding:10px 14px;background:#0B5F5A;color:#fff;font:700 13px/1 system-ui;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer;display:none}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function ensureStack() {
    var el = document.getElementById('qp-stack');
    if (!el) {
      el = document.createElement('div');
      el.id = 'qp-stack';
      document.body.appendChild(el);
    }
    return el;
  }

  // Shown-once store: each notification pops a single time, even across
  // polls and reloads. Keyed by DB id; socket-only events use a cooldown key.
  function shownGet() {
    try { return JSON.parse(localStorage.getItem('qp_shown_ids') || '{}'); } catch (e) { return {}; }
  }
  function shownHas(id) {
    if (!id) return false;
    try { return !!shownGet()[String(id)]; } catch (e) { return false; }
  }
  function shownMark(id) {
    if (!id) return;
    try {
      var m = shownGet(); m[String(id)] = Date.now();
      var keys = Object.keys(m);
      if (keys.length > 150) {
        keys.sort(function (a, b) { return m[a] - m[b]; });
        for (var i = 0; i < keys.length - 150; i++) delete m[keys[i]];
      }
      localStorage.setItem('qp_shown_ids', JSON.stringify(m));
    } catch (e) {}
  }
  function cooldownOk(key, ms) {
    if (!key) return true;
    try {
      var m = shownGet();
      var last = m['k:' + key] || 0;
      if (Date.now() - last < (ms || 300000)) return false;
      m['k:' + key] = Date.now();
      localStorage.setItem('qp_shown_ids', JSON.stringify(m));
      return true;
    } catch (e) { return true; }
  }

  function popup(n) {
    try {
      // One time only: skip already-seen DB notifications
      var nid = n && (n._id || n.id);
      if (nid && shownHas(nid)) return;
      ensureStyles();
      var stack = ensureStack();
      var card = document.createElement('div');
      var kind = (n && n.type) || 'general';
      var cls = kind === 'payment' ? 'payment' : (kind === 'system' || kind === 'verification' ? 'system' : 'order');
      card.className = 'qp-card ' + cls;
      var title = (n && n.title) || 'New notification';
      var msg = (n && n.message) || '';
      card.innerHTML = '<div class="qp-bell">🔔</div><div style="flex:1;min-width:0"><div class="qp-title"></div><div class="qp-msg"></div><div class="qp-act">Tap to view →</div></div>';
      card.querySelector('.qp-title').textContent = title;
      card.querySelector('.qp-msg').textContent = msg;
      card.onclick = function () {
        try { dismiss(true); } catch (e) {}
        // Seen = read: mark it read the moment the user taps View
        try {
          var rid = n && (n._id || n.id);
          if (rid && typeof api !== 'undefined' && api.markNotificationRead) api.markNotificationRead(rid).catch(function () {});
        } catch (e) {}
        goToNotification(n);
      };
      stack.appendChild(card);
      if (nid) shownMark(nid);
      ringBell(); vibrate();
      try {
        if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
          new Notification(title, { body: msg });
        }
      } catch (e) {}
      var dismissed = false;
      function dismiss(now) {
        if (dismissed) return; dismissed = true;
        card.classList.add('qp-out');
        setTimeout(function () { try { card.remove(); } catch (e) {} }, now ? 60 : 300);
      }
      setTimeout(function () { dismiss(false); }, 7000);
    } catch (e) {}
  }

  function goToNotification(n) {
    try {
      var data = (n && n.data) || {};
      var orderId = data.orderId || n.orderId;
      var role = null;
      try { role = JSON.parse(localStorage.getItem('user') || 'null')?.role; } catch (e) {}
      if (orderId) {
        if (role === 'nurse') location.href = (location.pathname.includes('/nurse/') ? '' : '/nurse/') + 'track-order.html?order=' + orderId;
        else if (role === 'patient') location.href = (location.pathname.includes('/patient/') ? '' : '/patient/') + 'track-nurse.html?order=' + orderId;
        else location.href = '/admin/orders.html';
        return;
      }
      if (location.pathname.indexOf('notifications.html') === -1) {
        var base = location.pathname.includes('/patient/') ? 'patient/' : location.pathname.includes('/nurse/') ? 'nurse/' : location.pathname.includes('/admin/') ? 'admin/' : '';
        location.href = base ? base.replace(/\/$/, '') + '/../notifications.html' : '/notifications.html';
      }
    } catch (e) {}
  }

  async function poll() {
    if (!enabled) return;
    try {
      if (!localStorage.getItem('token') || typeof api === 'undefined') return;
      var r = await api.getNotifications('?limit=5');
      var list = (r && r.data && r.data.notifications) || r.data || [];
      if (!Array.isArray(list) || !list.length) return;
      var newest = list[0];
      var nid = String(newest._id || newest.id || '');
      if (!lastSeenId) { lastSeenId = nid; return; }
      // Any unread item not shown before -> pop it exactly once
      for (var i = list.length - 1; i >= 0; i--) {
        var it = list[i];
        var id = String(it._id || it.id || '');
        if (id && id !== lastSeenId && !it.isRead && !shownHas(id)) {
          popup(it);
        }
      }
      lastSeenId = nid;
      if (typeof refreshNotifBadge === 'function') { try { refreshNotifBadge(); } catch (e) {} }
    } catch (e) {}
  }

  function connectSocket() {
    try {
      if (typeof io === 'undefined') return;
      var token = null;
      try { token = localStorage.getItem('token'); } catch (e) {}
      if (!token) return;
      var s = io({ auth: { token: token } });
      s.on('notification', function (d) {
        var oid = (d && ((d.data && d.data.orderId) || d.orderId)) || '';
        if (!cooldownOk('n:' + ((d && d.title) || '') + ':' + oid, 300000)) return;
        popup({ title: (d && d.title) || '🔔 New notification', message: (d && d.message) || '', type: 'general', data: d || {} });
      });
      s.on('new_order', function (d) {
        var oid2 = String((d && (d.orderId || (d.data && d.data.orderId))) || 'new');
        if (!cooldownOk('o:' + oid2, 300000)) return;
        popup({ title: '🔔 New service request', message: 'A new request is available — open requests now', type: 'order', data: d || {} });
      });
      s.on('order_update', function (d) {
        var st = (d && d.status) || '';
        var oid3 = String((d && (d.orderId || (d.data && d.data.orderId))) || '');
        if (!cooldownOk('u:' + oid3 + ':' + st, 120000)) return;
        var map = { assigned: 'A nurse accepted — track live now', in_progress: 'Service started', completed: 'Service completed — please rate with stars ⭐', cancelled: 'Order was cancelled' };
        popup({ title: '🔔 Order update', message: map[st] || ('Status: ' + st), type: 'order', data: d || {} });
      });
      s.on('permissions_update', function () { popup({ title: '🔔 Permissions updated', message: 'Admin updated your account permissions', type: 'system', data: {} }); });
      s.on('location_update', function () { /* silent — map handles it */ });
    } catch (e) {}
  }

  function ensureSoundUnlock() {
    // iOS/Android browsers require a user gesture before AudioContext plays.
    function unlock() {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          if (!audioCtx) audioCtx = new AC();
          if (audioCtx.state === 'suspended') audioCtx.resume();
        }
      } catch (e) {}
      try {
        if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
      } catch (e) {}
    }
    document.addEventListener('pointerdown', unlock, { passive: true });
    document.addEventListener('touchend', unlock, { passive: true });
  }

  if (typeof window !== 'undefined') {
    window.qpNotify = { popup: popup, ring: ringBell, poll: poll };
    window.playNotifSound = ringBell; // legacy compat
    document.addEventListener('DOMContentLoaded', function () {
      ensureStyles(); ensureStack(); ensureSoundUnlock();
      try {
        var seen = null;
        try { seen = localStorage.getItem('qp_last_notif'); } catch (e) {}
        lastSeenId = seen || null;
      } catch (e) {}
      setInterval(function () {
        poll().then(function () {
          try { if (lastSeenId) localStorage.setItem('qp_last_notif', lastSeenId); } catch (e) {}
        });
      }, POLL_MS);
      poll();
      connectSocket();
      // re-connect socket when token appears (after login redirect)
      setTimeout(connectSocket, 4000);
    });
  }
})();
