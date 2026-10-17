// Qarrib global nav — one navigation for every screen, on every device.
//
// Each page used to hand-roll its own sidebar or bottom bar, which is how whole
// screens ended up with no navigation at all on a phone. This module injects a
// single menu button plus a full-screen drawer built from the same section list
// the desktop sidebar uses, so every tab is reachable on a phone, a tablet, an
// installed app and a desktop browser.
(function () {
  'use strict';

  var ROLE_NAV = {
    patient: [
      { label: 'Home', href: 'patient/dashboard.html' },
      { label: 'Request a nurse', href: 'patient/request-service.html' },
      { label: 'Offers', href: 'patient/offers.html' },
      { label: 'Visits', href: 'patient/track-nurse.html' },
      { label: 'Chat', href: 'patient/chat.html' },
      { label: 'Wallet', href: 'patient/wallet.html' },
      { label: 'Call', href: 'call.html' },
      { label: 'Plans', href: 'plans.html' },
      { label: 'Support', href: 'patient/support-chat.html' }
    ],
    nurse: [
      { label: 'Home', href: 'nurse/dashboard.html' },
      { label: 'Requests', href: 'nurse/requests.html' },
      { label: 'My orders', href: 'nurse/my-orders.html' },
      { label: 'Chat', href: 'nurse/chat.html' },
      { label: 'Wallet', href: 'nurse/wallet.html' },
      { label: 'Call', href: 'call.html' },
      { label: 'Plans', href: 'plans.html' },
      { label: 'Support', href: 'nurse/support-chat.html' }
    ],
    assistant: [
      { label: 'Home', href: 'admin/dashboard.html' },
      { label: 'Helpers', href: 'admin/assistants.html' },
      { label: 'Assistant panel', href: 'admin/assistant-panel.html' },
      { label: 'Chat', href: 'admin/chat.html' },
      { label: 'Call', href: 'call.html' },
      { label: 'Support', href: 'admin/support-chat.html' }
    ],
    admin: [
      { label: 'Home', href: 'admin/dashboard.html' },
      { label: 'Orders', href: 'admin/orders.html' },
      { label: 'Patients', href: 'admin/manage-patients.html' },
      { label: 'Nurses', href: 'admin/manage-nurses.html' },
      { label: 'Payments', href: 'admin/payments.html' },
      { label: 'Transactions', href: 'admin/transactions.html' },
      { label: 'Offers', href: 'admin/offers.html' },
      { label: 'Plan prices', href: 'admin/set-prices.html' },
      { label: 'Subscriptions', href: 'admin/subscriptions.html' },
      { label: 'Users', href: 'admin/users.html' },
      { label: 'Helpers', href: 'admin/assistants.html' },
      { label: 'Admins', href: 'admin/admins.html' },
      { label: 'Permissions', href: 'admin/permissions.html' },
      { label: 'Devices', href: 'admin/devices.html' },
      { label: 'Feedbacks', href: 'admin/feedbacks.html' },
      { label: 'Audit log', href: 'admin/audit-log.html' },
      { label: 'Chat', href: 'admin/chat.html' },
      { label: 'Support', href: 'admin/support-chat.html' },
      { label: 'Call', href: 'call.html' }
    ]
  };

  // pages that should never get the menu (no session, or already a landing page)
  var SKIP = /(?:^|\/)(?:index|login|login-patient|login-nurse|login-assistant|assistant-login|admin-login|register)\.html$/i;

  function role() {
    try {
      if (typeof getRole === 'function') return getRole();
      var u = JSON.parse(localStorage.getItem('user') || 'null');
      return u && u.role;
    } catch (e) { return null; }
  }

  function root() {
    // resolve a section href against the site root so it works from any depth,
    // e.g. /nurse/wallet.html needs one "../" to reach /patient/dashboard.html
    var path = window.location.pathname || '/';
    var segs = path.split('/').filter(Boolean);
    segs.pop(); // drop the file name
    return segs.length ? '../'.repeat(segs.length) : '';
  }

  function currentFile() {
    var path = window.location.pathname || '';
    return (path.split('/').pop() || '').toLowerCase();
  }

  function mount() {
    if (document.getElementById('qarrib-menu-btn')) return;

    var r = role();
    var items = r && ROLE_NAV[r];
    if (!items || !items.length) return;

    var file = currentFile();
    var ar = false;
    try {
      ar = (localStorage.getItem('qarrib-language') === 'ar') ||
        (document.documentElement.lang === 'ar');
    } catch (e) {}

    var btn = document.createElement('button');
    btn.id = 'qarrib-menu-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', ar ? 'القائمة' : 'Menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span aria-hidden="true">&#9776;</span>';
    btn.addEventListener('click', function () { open(); });
    document.body.appendChild(btn);

    var overlay = document.createElement('div');
    overlay.id = 'qarrib-menu';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.hidden = true;

    var list = items.map(function (it) {
      var href = root() + it.href;
      var active = file === it.href.split('/').pop().toLowerCase() ? ' class="active"' : '';
      return '<a href="' + href + '"' + active + '>' + escapeHtml(it.label) + '</a>';
    }).join('');

    overlay.innerHTML =
      '<div class="qarrib-menu-panel">' +
        '<div class="qarrib-menu-head">' +
          '<span class="qarrib-menu-brand">Qarrib</span>' +
          '<button type="button" class="qarrib-menu-close" aria-label="' +
            (ar ? 'إغلاق' : 'Close') + '">&times;</button>' +
        '</div>' +
        '<nav class="qarrib-menu-list">' + list + '</nav>' +
        '<button type="button" class="qarrib-menu-logout">' +
          (ar ? 'تسجيل الخروج' : 'Log out') + '</button>' +
      '</div>';

    document.body.appendChild(overlay);

    overlay.querySelector('.qarrib-menu-close').addEventListener('click', close);
    overlay.querySelector('.qarrib-menu-logout').addEventListener('click', function () {
      if (typeof logout === 'function') logout();
      else window.location.href = '/';
    });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !overlay.hidden) close();
    });

    function open() {
      overlay.hidden = false;
      document.documentElement.classList.add('qarrib-menu-open');
      btn.setAttribute('aria-expanded', 'true');
    }
    function close() {
      overlay.hidden = true;
      document.documentElement.classList.remove('qarrib-menu-open');
      btn.setAttribute('aria-expanded', 'false');
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function init() {
    var file = currentFile();
    if (SKIP.test(file)) return;
    mount();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();