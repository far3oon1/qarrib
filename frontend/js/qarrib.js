/* Qarrib — patient panel renderer.
   Builds the mobile home shown in
   files(1)/WhatsApp Image 2026-10-02 at 16.13.26.jpeg out of LIVE API data.

   Notes
   - Every node is created with createElement + textContent, so nothing coming
     back from the API can inject markup.
   - Strings are written in English on purpose: js/language.js translates the
     whole tree (and flips <html dir>) when the app runs in Arabic, and its
     MutationObserver translates nodes we add later too. So never hardcode
     Arabic here.
   - Icons come from assets/icons.svg as an external <use> sprite.

   Depends on the global `api` from js/api.js. */
(function () {
    'use strict';

    var SVG_NS = 'http://www.w3.org/2000/svg';
    var XLINK_NS = 'http://www.w3.org/1999/xlink';

    /* This script is loaded as "js/qarrib.js" or "../js/qarrib.js" depending
       on page depth, so derive the sprite root from the script's own URL
       instead of the document (which would give /patient/assets/... -> 404). */
    var ROOT = (function () {
        var scripts = document.getElementsByTagName('script');
        for (var i = scripts.length - 1; i >= 0; i -= 1) {
            var src = scripts[i].getAttribute('src') || '';
            if (/(^|\/)js\/qarrib\.js(\?|$)/.test(src)) {
                var base = src.split('?')[0].split('#')[0];
                return base.slice(0, base.lastIndexOf('/') + 1).replace(/js\/$/, '');
            }
        }
        return '/';
    })();

    function el(tag, attrs, children) {
        var node = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (key) {
            if (key === 'text') node.textContent = attrs[key];
            else node.setAttribute(key, attrs[key]);
        });
        (children || []).forEach(function (child) {
            if (child) node.appendChild(child);
        });
        return node;
    }

    function icon(id, className) {
        var svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', className ? 'p-ico ' + className : 'p-ico');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        var use = document.createElementNS(SVG_NS, 'use');
        var href = ROOT + 'assets/icons.svg#' + id;
        use.setAttribute('href', href);
        use.setAttributeNS(XLINK_NS, 'xlink:href', href);
        svg.appendChild(use);
        return svg;
    }

    function byId(id) { return document.getElementById(id); }

    function setText(id, value) {
        var node = byId(id);
        if (node) node.textContent = value == null ? '' : String(value);
    }

    function empty(node) {
        while (node && node.firstChild) node.removeChild(node.firstChild);
    }

    function money(amount) {
        var value = Number(amount);
        if (!isFinite(value)) value = 0;
        var formatted;
        try { formatted = value.toLocaleString('en-US'); } catch (e) { formatted = String(value); }
        return formatted + ' EGP';
    }

    function isArabic() {
        return typeof window.getQarribLanguage === 'function'
            && window.getQarribLanguage() === 'ar';
    }

    function avatarNode(name, className) {
        var initial = String(name || '?').trim().charAt(0).toUpperCase() || '?';
        return el('span', { class: 'p-avatar ' + (className || ''), 'aria-hidden': 'true', text: initial });
    }

    /* ---------- header ---------- */
    function renderHeader(data) {
        var user = data.user || {};
        setText('userName', user.name || '');
        setText('userGreeting', user.greeting || '');
        setText('userGreetingName', user.greetingName || '');
        var slot = byId('userAvatar');
        if (slot) {
            empty(slot);
            slot.appendChild(avatarNode(user.name, 'p-top-avatar'));
        }
        var dot = byId('bellDot');
        if (dot) dot.hidden = !data.unreadNotifications;
    }

    /* ---------- wallet + emergency ---------- */
    function renderWallet(data) {
        setText('balance', money((data.wallet || {}).balance));
        var emergency = data.emergency || {};
        // Only the numbers: the surrounding words are static text nodes in the
        // markup, which is what language.js can actually translate.
        setText('sosEta', emergency.etaMinutes == null ? '45' : emergency.etaMinutes);
        setText('sosFee', emergency.feePercent == null ? '25' : emergency.feePercent);
    }

    /* Maps GET /api/services documents onto the booking keys used by
       patient/request-service.html (data-value), mirroring
       backend/src/utils/serviceCatalog.js. */
    var SERVICE_KEYS = {
        injection: 'injection',
        wound_care: 'wound',
        checkup: 'checkup',
        vital_signs: 'checkup',
        elderly_care: 'elderly',
        iv_therapy: 'iv',
        physiotherapy: 'physio',
        other: 'other'
    };
    var SERVICE_ICONS = {
        injection: 'i-syringe',
        wound: 'i-bandage',
        checkup: 'i-steth',
        elderly: 'i-user',
        iv: 'i-syringe',
        physio: 'i-plus',
        other: 'i-headset'
    };

    function normalizeServices(raw) {
        var list = Array.isArray(raw) ? raw : (raw && raw.services) || [];
        return list.map(function (service) {
            var key = SERVICE_KEYS[service.category] || SERVICE_KEYS[service.name] || 'other';
            return {
                id: key,
                icon: service.icon || SERVICE_ICONS[key] || 'i-steth',
                name: (isArabic() && service.nameAr) ? service.nameAr : (service.name || ''),
                price: service.basePrice,
                note: service.description || ''
            };
        });
    }

    /* ---------- services carousel ---------- */
    function renderServices(data) {
        var rail = byId('services');
        if (!rail) return;
        empty(rail);
        var list = data.services || [];
        if (!list.length) {
            rail.appendChild(el('div', { class: 'p-empty', text: 'No services available right now.' }));
            return;
        }
        list.forEach(function (service, index) {
            var card = el('a', {
                class: 'p-card',
                href: 'request-service.html?service=' + encodeURIComponent(service.id)
            });
            card.appendChild(el('span', { class: 'p-card-num', text: String(index + 1) }));
            card.appendChild(icon(service.icon || SERVICE_ICONS[service.id] || 'i-steth'));
            card.appendChild(el('h3', { text: service.name }));
            if (service.price != null) {
                card.appendChild(el('div', {
                    class: 'p-price',
                    text: typeof service.price === 'number' ? money(service.price) : service.price
                }));
            }
            if (service.note) card.appendChild(el('div', { class: 'p-note', text: service.note }));
            rail.appendChild(card);
        });
    }

    /* ---------- nurses rail ---------- */
    function renderNurses(data) {
        var rail = byId('nurses');
        if (!rail) return;
        empty(rail);
        var list = data.nurses || [];
        if (!list.length) {
            rail.appendChild(el('div', { class: 'p-empty', text: 'No nurses available right now.' }));
            return;
        }
        list.forEach(function (nurse) {
            var rating = el('span', { class: 'p-rating' }, [
                icon('i-star'),
                el('span', { text: nurse.rating == null ? 'New' : Number(nurse.rating).toFixed(1) })
            ]);
            var book = el('a', {
                class: 'p-btn-outline',
                href: 'request-service.html?nurse=' + encodeURIComponent(nurse.id || ''),
                text: 'Book now'
            });
            rail.appendChild(el('div', { class: 'p-nurse' }, [
                avatarNode(nurse.name),
                el('div', { class: 'p-nurse-name', text: nurse.name || '' }),
                rating,
                book
            ]));
        });
    }

    /* ---------- skeletons while loading ---------- */
    function showSkeletons() {
        [['services', 3, ''], ['nurses', 4, 'round']].forEach(function (spec) {
            var rail = byId(spec[0]);
            if (!rail) return;
            empty(rail);
            for (var i = 0; i < spec[1]; i += 1) {
                rail.appendChild(el('div', { class: 'p-skeleton ' + spec[2] }));
            }
        });
    }

    /* ---------- tab bar ---------- */
    function renderTabbar(items) {
        var bar = byId('tabbar');
        if (!bar) return;
        empty(bar);
        (items || []).forEach(function (item) {
            var link = el('a', { href: item.href });
            if (item.active) {
                link.className = 'active';
                link.setAttribute('aria-current', 'page');
            }
            link.appendChild(icon(item.icon));
            link.appendChild(el('span', { text: item.label }));
            bar.appendChild(link);
        });
    }

    function render(data) {
        data = data || {};
        renderHeader(data);
        renderWallet(data);
        renderServices(data);
        renderNurses(data);
    }

    window.Qarrib = {
        render: render,
        renderHeader: renderHeader,
        renderWallet: renderWallet,
        renderServices: renderServices,
        renderNurses: renderNurses,
        renderTabbar: renderTabbar,
        normalizeServices: normalizeServices,
        showSkeletons: showSkeletons,
        icon: icon,
        avatarNode: avatarNode,
        money: money
    };
})();