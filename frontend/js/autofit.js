// Qarrib Autofit v1 (ES5, no deps) — makes the installed app fit any platform
// exactly like the online website: phone / tablet / desktop / Electron /
// Capacitor / PWA-standalone share one responsive behaviour.
(function () {
  function isElectron() {
    try {
      return typeof window.desktopAPI !== 'undefined' || window.isDesktopApp === true ||
        (typeof navigator === 'object' && /electron/i.test(navigator.userAgent || ''));
    } catch (e) { return false; }
  }
  function isCapacitorNative() {
    try {
      return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) ||
        window.QarrabMobileNative === true ||
        (typeof navigator === 'object' && /capacitor/i.test(navigator.userAgent || ''));
    } catch (e) { return false; }
  }
  function isStandalone() {
    try {
      return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
        (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) ||
        window.navigator.standalone === true ||
        document.referrer.indexOf('android-app://') === 0;
    } catch (e) { return false; }
  }

  // Some mobile browsers (Android Chrome/Brave "Desktop site") force a ~980px
  // layout viewport AND ignore <meta viewport>, so every max-width media query
  // stops matching and the phone only ever gets the desktop layout. Screen
  // width is useless there because it is rewritten too, but touch capability
  // and the pointer type still describe the real device, so tag <html> from
  // those signals and let CSS lay out phones by class instead of by width.
  function isPhoneDevice() {
    try {
      var touch = (navigator.maxTouchPoints || 0) > 0 ||
        'ontouchstart' in window ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
      if (!touch) return false;
      var w = Math.min(screen.width || 0, window.innerWidth || 0) || 0;
      var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      // a touch device reporting a coarse pointer is a phone even when the
      // browser inflated the layout viewport
      if (coarse && (w === 0 || w <= 1024)) return true;
      return w > 0 && w <= 820;
    } catch (e) { return false; }
  }

  function applyClasses() {
    var b = document.body;
    if (!b) return;
    var w = window.innerWidth || document.documentElement.clientWidth || 0;
    var root = document.documentElement;
    b.classList.toggle('is-desktop-app', isElectron());
    b.classList.toggle('is-native', isCapacitorNative());
    b.classList.toggle('is-installed', isCapacitorNative() || isStandalone() || isElectron());
    b.classList.toggle('is-wide', w >= 901);
    b.classList.toggle('is-narrow', w <= 900);
    b.classList.toggle('is-landscape', (window.innerWidth || 0) > (window.innerHeight || 0));
    if (root) {
      root.classList.toggle('is-phone', isPhoneDevice());
      // remember a phone that was seen in desktop mode, so the next visit can
      // explain why the layout looks wrong instead of silently staying wrong
      try {
        if (isPhoneDevice() && w > 900) {
          root.classList.add('saw-phone-desktop-mode');
          try { sessionStorage.setItem('qarrib-saw-desktop-mode', '1'); } catch (e) {}
        } else if (!isPhoneDevice() || w <= 900) {
          root.classList.remove('saw-phone-desktop-mode');
          try { sessionStorage.removeItem('qarrib-saw-desktop-mode'); } catch (e) {}
        }
      } catch (e) {}
    }
    try { document.documentElement.style.setProperty('--qarrib-vw', (w / 100) + 'px'); } catch (e) {}
  }

  // dvh fallback for older WebViews: keep --qarrib-vh in sync with the real viewport
  function fixViewportHeight() {
    try {
      var vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--qarrib-vh', vh + 'px');
    } catch (e) {}
  }

  // If the backend-injected API base points at localhost but we run from a
  // packaged app (capacitor://, file://, electron), fall back to same-origin /api
  // so the installed app talks to its bundled backend like the website does.
  function normaliseApiBase() {
    try {
      var proto = String(window.location.protocol || '');
      if ((proto === 'capacitor:' || proto === 'file:' || isElectron()) && window.api) {
        if (window.api.baseURL && window.api.baseURL.indexOf('localhost') !== -1) {
          window.api.baseURL = '/api';
          window.API_BASE_URL = '/api';
        }
      }
    } catch (e) {}
  }

  // A phone stuck in desktop mode still gets the phone layout (see the
  // .is-phone rules), but the browser is also zoomed way out, so say so once.
  var desktopHintShown = false;
  function maybeShowDesktopHint() {
    if (desktopHintShown) return;
    var root = document.documentElement;
    if (!root || !root.classList.contains('saw-phone-desktop-mode')) return;
    desktopHintShown = true;
    var ar = false;
    try {
      ar = (localStorage.getItem('qarrib-language') === 'ar') ||
        (document.documentElement.lang === 'ar');
    } catch (e) {}
    var box = document.createElement('div');
    box.id = 'qarrib-desktop-hint';
    box.setAttribute('role', 'status');
    box.innerHTML = '<div><b>' + (ar ? 'وضع سطح المكتب مُفعّل' : 'Desktop site is on') + '</b>' +
      (ar
        ? ' الصفحة معروضة بعرض سطح المكتب. أوقف «موقع سطح المكتب» من إعدادات الموقع لرؤية تخطيط الهاتف.'
        : ' This page is rendering desktop-wide. Turn off “Desktop site” in the browser site settings to get the phone layout.') +
      '</div><button type="button">' + (ar ? 'حسناً' : 'Got it') + '</button>';
    box.querySelector('button').addEventListener('click', function () {
      box.remove();
      try { sessionStorage.setItem('qarrib-hint-dismissed', '1'); } catch (e) {}
    });
    document.body.appendChild(box);
  }

  function init() {
    applyClasses();
    fixViewportHeight();
    normaliseApiBase();
    try {
      if (!sessionStorage.getItem('qarrib-hint-dismissed')) {
        setTimeout(maybeShowDesktopHint, 800);
      }
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  window.addEventListener('resize', applyClasses);
  window.addEventListener('orientationchange', function () {
    setTimeout(function () { applyClasses(); fixViewportHeight(); }, 120);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fixViewportHeight);
  }
  if (window.matchMedia) {
    try {
      window.matchMedia('(display-mode: standalone)').addEventListener('change', applyClasses);
    } catch (e) {}
  }
})();
