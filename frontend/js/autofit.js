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

  function applyClasses() {
    var b = document.body;
    if (!b) return;
    var w = window.innerWidth || document.documentElement.clientWidth || 0;
    b.classList.toggle('is-desktop-app', isElectron());
    b.classList.toggle('is-native', isCapacitorNative());
    b.classList.toggle('is-installed', isCapacitorNative() || isStandalone() || isElectron());
    b.classList.toggle('is-wide', w >= 901);
    b.classList.toggle('is-narrow', w <= 900);
    b.classList.toggle('is-landscape', (window.innerWidth || 0) > (window.innerHeight || 0));
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

  function init() {
    applyClasses();
    fixViewportHeight();
    normaliseApiBase();
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
