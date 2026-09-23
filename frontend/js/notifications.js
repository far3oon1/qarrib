// Shared notifications helper: badge + toast + polling + socket push
// Include after api.js + auth.js. Add <span id="notifBadge"> in header to show count.
(function () {
  function toast(msg) {
    try {
      if (typeof showAlert === 'function') return showAlert(msg, 'success');
    } catch (e) {}
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification(msg); } catch (e) {}
    }
  }

  async function refreshBadge() {
    var badge = document.getElementById('notifBadge');
    if (!badge) return;
    try {
      var r = await api.getNotifications('?limit=1');
      var count = (r && r.unreadCount) || 0;
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.style.display = count > 0 ? 'inline-block' : 'none';
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
        toast((d && d.title) || 'إشعار جديد');
        refreshBadge();
      });
      s.on('new_order', function () { toast('طلب جديد متاح'); refreshBadge(); });
      s.on('order_update', function () { toast('تحديث على طلبك'); refreshBadge(); });
      s.on('new_message', function () { refreshBadge(); });
    } catch (e) {}
  }

  if (typeof window !== 'undefined') {
    window.refreshNotifBadge = refreshBadge;
    document.addEventListener('DOMContentLoaded', function () {
      refreshBadge();
      setInterval(refreshBadge, 30000);
      connectSocket();
      try {
        if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
      } catch (e) {}
    });
  }
})();
