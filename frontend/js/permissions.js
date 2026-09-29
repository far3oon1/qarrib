// Qarrib permissions gate — location + gallery + calling + notifications + legal terms.
// Works on: web, desktop app, Android (Capacitor), iOS (Capacitor/WKWebView).
// - Explains WHY each permission is needed (legal requirement notice from admin).
// - Requests native permission where available, falls back to web APIs.
// - Sends consents to backend (POST /api/permissions/consent) so admin can see
//   who approved what, and blocks gated screens until REQUIRED items are granted.
// Usage on any dashboard/track page:
//   <script src="../js/permissions.js?v=1"></script>
//   QarribPerms.requireGate('patient'|'nurse'); // shows modal if anything required is missing
(function () {
  'use strict';

  function isNative() {
    try {
      return (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) || !!window.QarrabMobileNative;
    } catch (e) { return false; }
  }
  function isIOS() {
    try {
      var ua = navigator.userAgent || '';
      return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    } catch (e) { return false; }
  }

  var PERM_DEFS = [
    { key: 'location', icon: '📍', title: 'Location', desc: 'Live tracking: patient sees the nurse on the map and the nurse sees the patient address. Required for safety and arrival estimates.' },
    { key: 'gallery', icon: '🖼️', title: 'Gallery / Photos', desc: 'Upload service images and verification documents (ID / nursing license).' },
    { key: 'calling', icon: '📞', title: 'Calling', desc: 'Call the nurse / patient on the registered number, or in-app call buttons.' },
    { key: 'notifications', icon: '🔔', title: 'Notifications', desc: 'Instant bell alerts when a service is requested, accepted, paid or completed.' },
    { key: 'terms', icon: '📜', title: 'Terms & privacy', desc: 'You accept that location, photos and phone number are used only to deliver the nursing service.' }
  ];

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  async function fetchState() {
    var fallback = { required: { location: true, calling: true, notifications: true, terms: true, gallery: false }, legal: null, myConsents: {} };
    try {
      if (typeof api === 'undefined' || !localStorage.getItem('token')) return fallback;
      var r = await api.getPermissionState();
      if (r && r.success && r.data) {
        return { required: r.data.required || fallback.required, legal: r.data.legal || null, myConsents: r.data.myConsents || {}, myLocationSharing: r.data.myLocationSharing || {} };
      }
    } catch (e) {}
    return fallback;
  }

  function deviceGranted(key) {
    // Local device-level signals (fast, no network)
    if (key === 'location') return lsGet('qp_perm_location') === 'granted';
    if (key === 'notifications') {
      try { return ('Notification' in window) && Notification.permission === 'granted'; } catch (e) { return false; }
    }
    if (key === 'terms') return lsGet('qp_terms_accepted') === '1';
    if (key === 'gallery' || key === 'calling') return lsGet('qp_perm_' + key) === 'granted';
    return false;
  }

  // Returns {ok, denied, code, message} — denied=true means the OS/browser
  // is BLOCKING prompts (user picked "Block", or app setting off). Retrying
  // the prompt will NOT work; the user must re-allow in settings first.
  var lastLocDenied = false;
  function requestLocationDetailed(fresh) {
    return new Promise(function (resolve) {
      try {
        if (!navigator.geolocation) return resolve({ ok: false, denied: false, code: 0, message: 'unsupported' });
        navigator.geolocation.getCurrentPosition(function (pos) {
          lastLocDenied = false;
          lsSet('qp_perm_location', 'granted');
          try {
            var lat = pos.coords.latitude, lng = pos.coords.longitude;
            if (typeof api !== 'undefined') {
              var role = null;
              try { role = JSON.parse(localStorage.getItem('user') || 'null')?.role; } catch (e) {}
              if (role === 'nurse') api.updateNurseLocation(lat, lng).catch(function () {});
              else if (role === 'patient') api.updateLocation(lat, lng).catch(function () {});
            }
          } catch (e) {}
          resolve({ ok: true, denied: false, lat: pos.coords.latitude, lng: pos.coords.longitude });
        }, function (err) {
          var code = (err && err.code) || 0;
          var denied = code === 1;
          if (denied) lastLocDenied = true;
          resolve({ ok: false, denied: denied, code: code, message: (err && err.message) || '' });
        }, { enableHighAccuracy: false, timeout: 30000, maximumAge: fresh ? 0 : 15000 });
      } catch (e) { resolve({ ok: false, denied: false, code: 0, message: String(e) }); }
    });
  }

  async function requestLocation() {
    var r = await requestLocationDetailed(false);
    return r.ok;
  }

  function wasLocationDenied() { return lastLocDenied; }

  // Help sheet shown when the OS blocks prompts: exact steps to re-allow.
  function showDeniedHelp(key) {
    ensureStyles();
    var old = document.getElementById('qp-perm-overlay');
    if (old) { try { old.remove(); } catch (e) {} }
    var ov = document.createElement('div');
    ov.id = 'qp-perm-overlay';
    var steps;
    if (key === 'location') {
      steps = isIOS()
        ? 'iPhone/iPad: Settings → Qarrib → Location → Allow (While Using). Then come back and tap Try again.'
        : isNative()
          ? 'Android app: Settings → Apps → Qarrib → Permissions → Location → Allow. Then come back and tap Try again.'
          : 'Browser blocked location for this site. Tap the 🔒/location icon in the address bar → allow Location for this site → then tap Try again. / المتصفح حظر الموقع: اضغط أيقونة القفل في شريط العنوان ← السماح بالموقع ← ثم حاول مجدداً.';
    } else if (key === 'notifications') {
      steps = 'Allow notifications for this site in the browser/app settings, then tap Try again. / فعّل الإشعارات من إعدادات المتصفح/التطبيق ثم حاول مجدداً.';
    } else {
      steps = 'Allow it in the system settings, then tap Try again. / فعّله من إعدادات النظام ثم حاول مجدداً.';
    }
    ov.innerHTML = '<div id="qp-perm-card"><h2>⚠️ ' + escapeHtml(key === 'location' ? 'Location is blocked / الموقع محظور' : 'Permission blocked / الإذن محظور') + '</h2>' +
      '<div class="sub">' + escapeHtml(steps) + '</div>' +
      '<div id="qp-perm-actions"><button id="qp-perm-close">Close / إغلاق</button><button id="qp-perm-accept">Try again / حاول مجدداً</button></div></div>';
    document.body.appendChild(ov);
    return new Promise(function (resolve) {
      ov.querySelector('#qp-perm-close').onclick = function () { ov.remove(); resolve(false); };
      ov.querySelector('#qp-perm-accept').onclick = async function () {
        ov.querySelector('#qp-perm-accept').textContent = '…';
        var ok = await requestOne(key);
        ov.remove();
        resolve(!!ok);
      };
    });
  }

  async function requestNotifications() {
    try {
      if (!('Notification' in window)) { lsSet('qp_perm_notifications', 'granted'); return true; }
      if (Notification.permission === 'granted') return true;
      var res = await Notification.requestPermission();
      return res === 'granted';
    } catch (e) { return false; }
  }

  // Gallery: REAL device interaction — the OS picker IS the permission grant.
  // We open a throwaway picker; consent is recorded only if the user picks
  // a photo (cancel = not granted). Point-of-use uploads also mark it.
  async function requestGallery() {
    return new Promise(function (resolve) {
      try {
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
        var done = false;
        function finish(ok) {
          if (done) return; done = true;
          try { inp.remove(); } catch (e) {}
          if (ok) { lsSet('qp_perm_gallery', 'granted'); pushConsents({ gallery: true }); }
          resolve(ok);
        }
        inp.onchange = function () { finish(inp.files && inp.files.length > 0); };
        if ('oncancel' in inp) inp.oncancel = function () { finish(false); };
        document.body.appendChild(inp);
        inp.click();
        setTimeout(function () { if (!done) { try { inp.remove(); } catch (e) {} if (!done) { done = true; resolve(lsGet('qp_perm_gallery') === 'granted'); } } }, 90000);
        // Fallback for browsers without 'cancel': focus back with no file = dismissed
        var onFocus = function () {
          setTimeout(function () {
            if (!done && (!inp.files || !inp.files.length)) { window.removeEventListener('focus', onFocus); finish(false); }
          }, 800);
        };
        window.addEventListener('focus', onFocus);
      } catch (e) { resolve(false); }
    });
  }
  async function requestCalling() {
    // tel: links need no OS permission on web; on Android CALL_PHONE is in the
    // manifest and the system asks on first call. We record the legal consent.
    lsSet('qp_perm_calling', 'granted');
    return true;
  }

  async function requestOne(key) {
    if (key === 'location') return requestLocation();
    if (key === 'notifications') return requestNotifications();
    if (key === 'gallery') return requestGallery();
    if (key === 'calling') return requestCalling();
    if (key === 'terms') { lsSet('qp_terms_accepted', '1'); return true; }
    return false;
  }

  async function pushConsents(grantedMap) {
    try {
      if (typeof api === 'undefined' || !localStorage.getItem('token')) return;
      await api.saveConsents(grantedMap);
    } catch (e) {}
  }

  function ensureStyles() {
    if (document.getElementById('qp-perm-styles')) return;
    var s = document.createElement('style');
    s.id = 'qp-perm-styles';
    s.textContent = [
      '#qp-perm-overlay{position:fixed;inset:0;z-index:100000;background:rgba(20,48,46,.55);display:flex;align-items:flex-end;justify-content:center;padding:12px;box-sizing:border-box}',
      '@media(min-width:700px){#qp-perm-overlay{align-items:center}}',
      '#qp-perm-card{background:#fff;border-radius:22px;max-width:520px;width:100%;max-height:92vh;overflow:auto;padding:22px;box-sizing:border-box;font-family:inherit}',
      '#qp-perm-card h2{margin:0 0 4px;font-size:20px;color:#14302E}#qp-perm-card .sub{font-size:13px;color:#4A605E;line-height:1.6}',
      '.qp-perm-row{display:flex;gap:12px;align-items:flex-start;border:1px solid #E7E2D5;border-radius:14px;padding:12px;margin-top:10px}',
      '.qp-perm-ic{width:40px;height:40px;border-radius:12px;background:#F6F3EC;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}',
      '.qp-perm-row b{font-size:14px;color:#14302E}.qp-perm-row p{margin:2px 0 0;font-size:12px;color:#4A605E;line-height:1.5}',
      '.qp-perm-badge{margin-inline-start:auto;font-size:11px;font-weight:800;padding:4px 10px;border-radius:999px;flex-shrink:0}',
      '.qp-ok{background:#DCFCE7;color:#166534}.qp-need{background:#FEF3C7;color:#92400E}',
      '.qp-perm-btn{border:0;border-radius:12px;padding:8px 14px;font-weight:800;font-size:13px;cursor:pointer;margin-top:8px}',
      '.qp-allow{background:#0B5F5A;color:#fff}.qp-later{background:#F6F3EC;color:#4A605E}',
      '#qp-perm-actions{display:flex;gap:10px;margin-top:16px}#qp-perm-actions button{flex:1;border:0;border-radius:14px;padding:14px;font-weight:800;font-size:15px;cursor:pointer}',
      '#qp-perm-accept{background:#0B5F5A;color:#fff}#qp-perm-accept:disabled{opacity:.45}#qp-perm-close{background:#F6F3EC;color:#14302E}',
      '.qp-dev-hint{font-size:11px;color:#4A605E;background:#F6F3EC;border-radius:10px;padding:8px 10px;margin-top:12px;line-height:1.6}'
    ].join('\n');
    document.head.appendChild(s);
  }

  async function showGate(role) {
    var state = await fetchState();
    var required = state.required || {};
    // merge backend consents with local device signals
    function granted(key) {
      var b = state.myConsents && state.myConsents[key] && state.myConsents[key].granted;
      if (b) return true;
      return deviceGranted(key);
    }
    var missing = PERM_DEFS.filter(function (d) { return required[d.key] && !granted(d.key); });
    if (!missing.length) return true;

    ensureStyles();
    return new Promise(function (resolve) {
      var ov = document.createElement('div');
      ov.id = 'qp-perm-overlay';
      var legalTitle = (state.legal && state.legal.title) || 'App permissions — legal notice';
      var legalBody = (state.legal && state.legal.body) || 'Qarrib needs location (live tracking), gallery (service images), calling (contact on the registered number) and notifications. On Android & iOS the system will ask you to Allow. Required for the service to work safely and legally.';
      var platNote = isNative()
        ? (isIOS() ? 'You are on iOS: tap Allow when the system dialog appears. You can change this later in Settings → Qarrib.' : 'You are on Android: tap Allow when the system dialog appears. You can change this later in Settings → Apps → Qarrib → Permissions.')
        : 'You are on web: your browser will ask for Location and Notifications. Gallery and Calling are granted inside the app.';
      ov.innerHTML =
        '<div id="qp-perm-card"><h2>' + escapeHtml(legalTitle) + '</h2>' +
        '<div class="sub">' + escapeHtml(legalBody) + '</div>' +
        '<div id="qp-perm-list"></div>' +
        '<div class="qp-dev-hint">' + escapeHtml(platNote) + '</div>' +
        '<div id="qp-perm-actions"><button id="qp-perm-close">Later</button><button id="qp-perm-accept" disabled>Enable required</button></div></div>';
      document.body.appendChild(ov);
      var list = ov.querySelector('#qp-perm-list');
      var status = {};
      PERM_DEFS.forEach(function (d) {
        if (!required[d.key]) return;
        var ok = granted(d.key);
        status[d.key] = ok;
        var row = document.createElement('div');
        row.className = 'qp-perm-row';
        row.innerHTML = '<div class="qp-perm-ic">' + d.icon + '</div><div style="flex:1"><b></b><p></p><button class="qp-perm-btn qp-allow">Enable</button></div><span class="qp-perm-badge"></span>';
        row.querySelector('b').textContent = d.title + (required[d.key] ? ' (required)' : '');
        row.querySelector('p').textContent = d.desc;
        var badge = row.querySelector('.qp-perm-badge');
        var btn = row.querySelector('button');
        function paint() {
          badge.textContent = status[d.key] ? 'Allowed ✓' : 'Needed';
          badge.className = 'qp-perm-badge ' + (status[d.key] ? 'qp-ok' : 'qp-need');
          btn.style.display = status[d.key] ? 'none' : 'inline-block';
          refreshAccept();
        }
        btn.onclick = async function () {
          btn.textContent = 'Requesting…';
          var ok2 = await requestOne(d.key);
          // OS is blocking prompts (earlier "Block") — guide to settings instead
          if (!ok2 && d.key === 'location' && wasLocationDenied()) {
            btn.textContent = 'Enable';
            paint();
            await showDeniedHelp('location');
            try { await fetchState(); } catch (e) {}
            status[d.key] = granted(d.key);
            paint();
            return;
          }
          status[d.key] = ok2 || status[d.key];
          if (ok2) { var m = {}; m[d.key] = true; pushConsents(m); if (d.key === 'terms') lsSet('qp_terms_accepted', '1'); }
          btn.textContent = 'Enable';
          paint();
        };
        paint();
        list.appendChild(row);
      });
      function refreshAccept() {
        var allOk = Object.keys(status).every(function (k) { return status[k]; });
        ov.querySelector('#qp-perm-accept').disabled = !allOk;
      }
      refreshAccept();
      ov.querySelector('#qp-perm-close').onclick = function () { ov.remove(); resolve(false); };
      ov.querySelector('#qp-perm-accept').onclick = async function () {
        var m = {};
        Object.keys(status).forEach(function (k) { if (status[k]) m[k] = true; });
        m.terms = m.terms || lsGet('qp_terms_accepted') === '1' || undefined;
        await pushConsents(m);
        ov.remove();
        resolve(true);
      };
    });
  }

  // ---- Enforcement: fast sync check + blocking ensure + global guards ----
  var cachedConsents = null;
  var origFetchState = fetchState;
  fetchState = function () {
    return origFetchState().then(function (st) {
      try { cachedConsents = st.myConsents || {}; } catch (e) {}
      return st;
    });
  };

  function isGranted(key) {
    try {
      if (cachedConsents && cachedConsents[key] && cachedConsents[key].granted) return true;
    } catch (e) {}
    return deviceGranted(key);
  }

  // ensure(key): guarantees a REAL grant before the app proceeds.
  // Returns true only when the OS-level permission was actually granted
  // (location fix, real photo picked, system notification allowed...).
  // Shows a compact blocking sheet when it is still missing.
  async function ensure(key) {
    if (isGranted(key)) return true;
    try { await fetchState(); } catch (e) {}
    if (isGranted(key)) return true;
    var def = null;
    PERM_DEFS.forEach(function (d) { if (d.key === key) def = d; });
    var label = def ? def.title : key;
    ensureStyles();
    var go = window.confirm
      ? window.confirm('Qarrib needs "' + label + '" enabled to continue.\nPress OK to enable it now (the system will ask you).\n\nqarrib يحتاج تفعيل "' + label + '" للمتابعة. اضغط موافق للتفعيل الآن.')
      : true;
    if (!go) return false;
    var ok = await requestOne(key);
    // Blocked at OS level → open the settings guide, then re-check
    if (!ok && key === 'location' && wasLocationDenied()) {
      ok = await showDeniedHelp('location');
    }
    if (ok) {
      var m = {}; m[key] = true;
      try { await pushConsents(m); } catch (e) {}
      try { cachedConsents = cachedConsents || {}; cachedConsents[key] = { granted: true }; } catch (e) {}
    }
    return !!ok;
  }

  // call(number): gated dialing — calling consent is enforced before tel:
  async function call(number) {
    var num = String(number || '').trim();
    if (!num) {
      try { if (typeof showAlert === 'function') showAlert('No registered number / لا يوجد رقم مسجل', 'error'); } catch (e) {}
      return false;
    }
    var ok = await ensure('calling');
    if (!ok) return false;
    try { window.location.href = 'tel:' + num; } catch (e) {}
    return true;
  }

  // Global guards: uploads prove gallery access, tel: links prove calling consent.
  function installGuards() {
    try {
      // Any real photo/document chosen = gallery granted (direct OS interaction)
      document.addEventListener('change', function (ev) {
        try {
          var t = ev.target;
          if (t && t.tagName === 'INPUT' && t.type === 'file' && t.files && t.files.length) {
            lsSet('qp_perm_gallery', 'granted');
            pushConsents({ gallery: true });
            try { cachedConsents = cachedConsents || {}; cachedConsents.gallery = { granted: true }; } catch (e) {}
          }
        } catch (e) {}
      });
      // tel: links require calling consent first — enforced, not just clicked
      document.addEventListener('click', function (ev) {
        try {
          var a = ev.target && ev.target.closest ? ev.target.closest('a[href^="tel:"]') : null;
          if (!a) return;
          if (isGranted('calling')) return; // already enabled — dial straight away
          ev.preventDefault();
          var num = (a.getAttribute('href') || '').replace(/^tel:/, '');
          call(num);
        } catch (e) {}
      }, true);
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installGuards);
  } else {
    installGuards();
  }
  // Small inline banner for track pages: location sharing on/off (online permission)
  async function sharingToggle(containerId, orderId) {
    try {
      var el = document.getElementById(containerId);
      if (!el) return;
      var state = await fetchState();
      var sharing = state.myLocationSharing || {};
      var on = sharing.shareLiveLocation !== false;
      el.innerHTML = '';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.style.cssText = 'border:1px solid #D9D3C5;background:' + (on ? '#0B5F5A' : '#fff') + ';color:' + (on ? '#fff' : '#14302E') + ';border-radius:999px;padding:8px 14px;font-weight:700;font-size:13px;cursor:pointer;width:100%';
      btn.textContent = on ? '📍 Live location sharing: ON (tap to pause)' : '📍 Live location sharing: OFF (tap to enable)';
      btn.onclick = async function () {
        var next = !(sharing.shareLiveLocation !== false);
        sharing.shareLiveLocation = next;
        btn.textContent = next ? '📍 Live location sharing: ON (tap to pause)' : '📍 Live location sharing: OFF (tap to enable)';
        btn.style.background = next ? '#0B5F5A' : '#fff';
        btn.style.color = next ? '#fff' : '#14302E';
        try { await api.saveConsents({ shareLiveLocation: next }); } catch (e) {}
        if (next) requestLocation();
      };
      el.appendChild(btn);
    } catch (e) {}
  }

  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  window.QarribPerms = {
    requireGate: showGate,
    sharingToggle: sharingToggle,
    requestLocation: requestLocation,
    requestLocationDetailed: requestLocationDetailed,
    wasLocationDenied: wasLocationDenied,
    showDeniedHelp: showDeniedHelp,
    ensure: ensure,
    isGranted: isGranted,
    call: call,
    isNative: isNative, isIOS: isIOS
  };
})();
