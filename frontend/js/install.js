(function () {
    var deferredPrompt = null;
    var isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('../sw.js').catch(function () {});
        });
    }

    function buildHelp() {
        var ov = document.createElement('div');
        ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;';
        ov.innerHTML =
            '<div style="background:#fff;border-radius:16px;max-width:440px;width:100%;padding:22px;text-align:center;">' +
            '<div style="font-size:34px;margin-bottom:8px;">📲</div>' +
            '<h3 style="margin:0 0 10px;font-family:Fraunces,Georgia,serif;">' + t('installTitle') + '</h3>' +
            '<div id="installSteps" style="text-align:start;font-size:14px;color:#4A605E;line-height:2;background:#F6F3EC;border:1px solid #D9D3C5;border-radius:10px;padding:12px 16px;white-space:pre-line;"></div>' +
            '<button class="q-btn" style="width:100%;margin-top:14px;" onclick="this.closest(\'div[style*=fixed]\').remove()">' + t('close') + '</button>' +
            '</div>';
        document.body.appendChild(ov);
        var steps = '';
        if (isIOS) {
            steps = t('iosSteps');
        } else {
            steps = t('otherSteps');
        }
        document.getElementById('installSteps').textContent = steps;
    }

    function t(key) {
        var lang = 'en';
        try { lang = window.qarribLanguage || localStorage.getItem('qarrib-language') || 'en'; } catch (e) {}
        var AR = {
            installTitle: 'تثبيت التطبيق',
            iosSteps: '1) افتح الرابط في متصفح Safari\n2) اضغط زر المشاركة (مربع وسهم)\n3) اختر «إضافة إلى الشاشة الرئيسية»\n4) اضغط «إضافة» — سيظهر التطبيق على جهازك',
            otherSteps: 'Chrome/Android: اضغط ⋮ القائمة أعلى المتصفح ← «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».\nEdge: ⋯ ← «تطبيقات» ← «تثبيت هذا الموقع».\nDesktop: أيقونة التثبيت في شريط العنوان.',
            close: 'إغلاق'
        };
        var EN = {
            installTitle: 'Install the app',
            iosSteps: '1) Open this link in Safari\n2) Tap the Share button (square with arrow)\n3) Choose "Add to Home Screen"\n4) Tap "Add" — the app installs on your device',
            otherSteps: 'Chrome/Android: tap the ⋮ menu at the top → "Install app" or "Add to Home screen".\nEdge: ⋯ → "Apps" → "Install this site".\nDesktop: use the install icon in the address bar.',
            close: 'Close'
        };
        return (lang === 'ar' ? AR : EN)[key] || EN[key];
    }

    function updateButtons() {
        document.querySelectorAll('[data-install-btn]').forEach(function (btn) {
            if (isStandalone) { btn.style.display = 'none'; return; }
            btn.style.display = '';
        });
    }

    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferredPrompt = e;
        updateButtons();
    });

    window.addEventListener('appinstalled', function () {
        deferredPrompt = null;
        updateButtons();
    });

    window.QarribInstall = {
        prompt: function () {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then(function () { deferredPrompt = null; updateButtons(); });
            } else {
                buildHelp();
            }
        }
    };

    updateButtons();
})();
