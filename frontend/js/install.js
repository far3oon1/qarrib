(function () {
    var deferredPrompt = null;
    var installButton = null;
    var isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
        (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
    var isFirefox = !isIOS && /firefox|fxios/i.test(window.navigator.userAgent);
    var isDesktopShell = /electron/i.test(window.navigator.userAgent);
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
    var supportsNativeInstall = 'BeforeInstallPromptEvent' in window;

    function serviceWorkerUrl() {
        try {
            var script = document.currentScript;
            if (script && script.src) {
                return new URL('../sw.js', script.src).href;
            }
        } catch (e) {
            console.warn('Qarrib could not resolve the service worker path.', e);
        }
        return '../sw.js';
    }

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register(serviceWorkerUrl(), { updateViaCache: 'none' })
                .then(function (registration) {
                    function checkForUpdate() {
                        if (document.visibilityState === 'visible') {
                            registration.update().catch(function (error) {
                                console.warn('Qarrib could not check for an app update.', error);
                            });
                        }
                    }

                    document.addEventListener('visibilitychange', checkForUpdate);
                    window.addEventListener('focus', checkForUpdate);
                    checkForUpdate();
                })
                .catch(function (error) {
                    console.warn('Qarrib could not register offline app support.', error);
                });
        });
    }

    function currentLang() {
        try { return window.qarribLanguage || localStorage.getItem('qarrib-language') || document.documentElement.lang || 'en'; } catch (e) { return document.documentElement.lang || 'en'; }
    }

    function text(key) {
        var ar = currentLang() === 'ar';
        var strings = {
            install: ar ? '📲 تثبيت التطبيق' : '📲 Install Qarrib',
            title: ar ? 'أضف قرّب إلى جهازك' : 'Add Qarrib to your device',
            ios: ar
                ? 'اضغط زر المشاركة في Safari، ثم اختر «إضافة إلى الشاشة الرئيسية» واتبع التعليمات.'
                : 'In Safari, tap Share, choose “Add to Home Screen,” then follow the prompts.',
            android: ar
                ? 'افتح قائمة المتصفح واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».'
                : 'Open your browser menu and choose “Install app” or “Add to Home screen.”',
            desktop: ar
                ? 'اختر أيقونة التثبيت في شريط العنوان، أو افتح قائمة المتصفح واختر «تثبيت التطبيق».'
                : 'Select the install icon in the address bar, or open the browser menu and choose “Install app.”',
            firefox: ar
                ? 'متصفح فايرفوكس لا يدعم تثبيت التطبيقات. افتح الموقع في كروم أو إيدج، أو استخدم هاتفك لتثبيت التطبيق.'
                : 'Firefox cannot install apps. Open Qarrib in Chrome or Edge instead, or install from your phone.',
            close: ar ? 'إغلاق' : 'Close'
        };
        return strings[key];
    }

    function showInstallHelp() {
        var overlay = document.createElement('div');
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'qarribInstallTitle');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;';
        var isMobile = /android|iphone|ipad|ipod|mobile/i.test(window.navigator.userAgent);
        var instructions = isIOS ? text('ios') : (isFirefox ? text('firefox') : (isMobile ? text('android') : text('desktop')));
        overlay.innerHTML =
            '<section style="background:#fff;border-radius:16px;max-width:440px;width:100%;padding:22px;text-align:center;">' +
            '<h2 id="qarribInstallTitle" style="margin:0 0 10px;font-family:Fraunces,Georgia,serif;">' + text('title') + '</h2>' +
            '<p style="margin:0;color:#4A605E;line-height:1.7;">' + instructions + '</p>' +
            '<button class="q-btn" type="button" style="width:100%;margin-top:14px;">' + text('close') + '</button>' +
            '</section>';
        overlay.querySelector('button').addEventListener('click', function () {
            overlay.remove();
        });
        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) overlay.remove();
        });
        document.body.appendChild(overlay);
        overlay.querySelector('button').focus();
    }

    function updateButton() {
        if (installButton) installButton.style.display = isStandalone ? 'none' : 'flex';
    }

    function fireInstallPrompt() {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function () {
            deferredPrompt = null;
            updateButton();
        }).catch(function (error) {
            console.error('Qarrib could not complete the app install prompt.', error);
        });
    }

    function createInstallButton() {
        // a cached older api.js may still inject its own floating button;
        // this file owns the single install button, so drop the duplicate.
        ['qarrib-install-button'].forEach(function (id) {
            var stale = document.getElementById(id);
            if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
        });
        if (document.getElementById('qarribInstallButton')) {
            installButton = document.getElementById('qarribInstallButton');
            updateButton();
            return;
        }
        var button = document.createElement('button');
        button.id = 'qarribInstallButton';
        button.type = 'button';
        button.setAttribute('aria-label', text('install'));
        button.style.cssText = 'position:fixed;bottom:16px;inset-inline-start:14px;z-index:9999;background:#0B5F5A;color:#fff;border:none;border-radius:999px;padding:12px 18px;font-size:14px;font-weight:700;box-shadow:0 8px 24px rgba(11,95,90,.35);cursor:pointer;display:flex;align-items:center;gap:8px;font-family:inherit;';
        button.textContent = text('install');
        button.addEventListener('click', function () {
            if (deferredPrompt) {
                fireInstallPrompt();
                return;
            }
            showInstallHelp();
        });
        document.body.appendChild(button);
        installButton = button;
        var hasBottomNav = document.querySelector('nav.p-tabbar, nav.q-bottomnav, .q-bottomnav');
        if (hasBottomNav) button.style.bottom = '84px';
        updateButton();
    }

    function maybeCreateInstallButton() {
        if (isDesktopShell || isStandalone) return;
        if (supportsNativeInstall && !deferredPrompt) return;
        createInstallButton();
    }

    window.addEventListener('beforeinstallprompt', function (event) {
        event.preventDefault();
        deferredPrompt = event;
        maybeCreateInstallButton();
    });
    window.addEventListener('appinstalled', function () {
        deferredPrompt = null;
        isStandalone = true;
        updateButton();
    });

    if (document.body) {
        maybeCreateInstallButton();
    } else {
        document.addEventListener('DOMContentLoaded', maybeCreateInstallButton);
    }
})();
