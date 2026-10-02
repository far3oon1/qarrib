/* Qarrib app-shell renderer.
   Layout ported from files(1) (header / wallet card / emergency card /
   priced service tiles / nurse rail / icon tab bar) onto the teal design
   tokens in css/qarrib-design.css.

   Everything is built with textContent + createElement, so values coming
   from the API can never inject markup. All text is plain English and is
   translated to Arabic by js/language.js when the user switches language.

   Requires: js/api.js (global `api`), js/auth.js, assets/icons.svg sprite. */
(function () {
    'use strict';

    var SVG_NS = 'http://www.w3.org/2000/svg';
    var XLINK_NS = 'http://www.w3.org/1999/xlink';

    /* The sprite lives in /assets, so resolve it against the document root
       rather than the current folder — this file is loaded from pages at
       three different depths (/patient/, /nurse/, /admin/ and the root). */
    var SPRITE = (function () {
        var base = document.querySelector('base');
        if (base && base.getAttribute('href')) return base.getAttribute('href');
        var path = String(window.location.pathname || '');
        return path.slice(0, path.lastIndexOf('/') + 1) || '/';
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
        svg.setAttribute('class', className ? 'q-ico ' + className : 'q-ico');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        var use = document.createElementNS(SVG_NS, 'use');
        use.setAttribute('href', SPRITE + 'assets/icons.svg#' + id);
        use.setAttributeNS(XLINK_NS, 'xlink:href', SPRITE + 'assets/icons.svg#' + id);
        svg.appendChild(use);
        return svg;
    }

    function byId(id) { return document.getElementById(id); }

    function setText(id, value) {
        var node = byId(id);
        if (node) node.textContent = value == null ? '' : String(value);
    }

    function clear(node) {
        while (node && node.firstChild) node.removeChild(node.firstChild);
    }

    function avatarNode(name, size) {
        var initial = String(name || '?').trim().charAt(0).toUpperCase() || '?';
        var avatar = el('span', { class: 'q-avatar', 'aria-hidden': 'true', text: initial });
        avatar.style.width = (size || 40) + 'px';
        avatar.style.height = (size || 40) + 'px';
        avatar.style.fontSize = Math.round((size || 40) * 0.42) + 'px';
        return avatar;
    }

    function money(amount) {
        var value = Number(amount);
        if (!isFinite(value)) value = 0;
        var formatted;
        try {
            formatted = value.toLocaleString('en-US');
        } catch (e) {
            formatted = String(value);
        }
        return formatted + ' EGP';
    }

    /* ---------- header ---------- */
    function renderHeader(data) {
        var user = data.user || {};
        setText('userName', user.name || '');
        setText('userGreeting', user.greeting || '');
        var slot = byId('userAvatar');
        if (slot) {
            clear(slot);
            slot.appendChild(avatarNode(user.name, 40));
        }
        var dot = byId('bellDot');
        if (dot) dot.hidden = !data.unreadNotifications;
    }

    /* ---------- wallet + emergency ---------- */
    function renderWallet(data) {
        setText('balance', money((data.wallet || {}).balance));
        var emergency = data.emergency || {};
        setText('sosEta', emergency.etaMinutes == null ? '' : emergency.etaMinutes);
        setText('sosFee', emergency.feePercent == null ? '' : emergency.feePercent);
    }

    /* ---------- priced service tiles ---------- */
    var SERVICE_ICONS = {
        injection: 'i-syringe',
        injections: 'i-syringe',
        iv: 'i-syringe',
        wound: 'i-bandage',
        dressing: 'i-bandage',
        checkup: 'i-steth',
        vitals: 'i-steth',
        elderly: 'i-user',
        surgery: 'i-bandage'
    };

    function serviceIcon(name) {
        var key = String(name || '').toLowerCase();
        var keys = Object.keys(SERVICE_ICONS);
        for (var i = 0; i < keys.length; i += 1) {
            if (key.indexOf(keys[i]) !== -1) return SERVICE_ICONS[keys[i]];
        }
        return 'i-steth';
    }

    function renderServices(data) {
        var grid = byId('services');
        if (!grid) return;
        clear(grid);
        (data.services || []).forEach(function (service) {
            var link = el('a', {
                class: 'q-service',
                href: 'request-service.html?service=' + encodeURIComponent(service.id || service.name || '')
            });
            link.appendChild(el('div', { class: 'q-service-top' }, [
                icon(service.icon || serviceIcon(service.name))
            ]));
            link.appendChild(el('div', { text: service.name || '' }));
            if (service.price != null) {
                link.appendChild(el('div', {
                    class: 'q-service-price',
                    text: typeof service.price === 'number' ? money(service.price) : service.price
                }));
            }
            if (service.note) {
                link.appendChild(el('div', { class: 'q-service-note', text: service.note }));
            }
            grid.appendChild(link);
        });
    }

    /* ---------- nurse rail ---------- */
    function renderNurses(data) {
        var list = byId('nurses');
        if (!list) return;
        clear(list);
        (data.nurses || []).forEach(function (nurse) {
            var name = nurse.name || '';
            var rating = el('span', { class: 'q-rating' }, [
                icon('i-star'),
                el('span', { text: nurse.rating == null ? 'New' : Number(nurse.rating).toFixed(1) })
            ]);
            var book = el('a', {
                class: 'q-btn-onbrand',
                href: 'request-service.html?nurse=' + encodeURIComponent(nurse.id || ''),
                text: 'Book now'
            });
            list.appendChild(el('div', { class: 'q-nurse' }, [
                avatarNode(name, 44),
                el('div', { style: 'flex:1;min-width:0' }, [
                    el('div', { class: 'q-nurse-name', text: name }),
                    rating
                ]),
                book
            ]));
        });
    }

    /* ---------- tab bar ---------- */
    function renderTabbar(items) {
        var bar = byId('tabbar');
        if (!bar) return;
        clear(bar);
        (items || []).forEach(function (item) {
            var link = el('a', { href: item.href });
            if (item.icon) link.appendChild(icon(item.icon));
            link.appendChild(el('span', { text: item.label }));
            if (item.active) {
                link.className = 'active';
                link.setAttribute('aria-current', 'page');
            }
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
        renderTabbar: renderTabbar,
        icon: icon,
        avatarNode: avatarNode,
        money: money
    };
})();