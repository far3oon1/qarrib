(function () {
  var socket = null;
  var reconnectAttempts = 0;
  var maxReconnectAttempts = 5;
  var reconnectDelay = 2000;
  var listeners = {};

  function getBackendUrl() {
    if (typeof window.QARRIB_BACKEND_URL === 'string' && window.QARRIB_BACKEND_URL.trim()) {
      return window.QARRIB_BACKEND_URL.trim().replace(/\/+$/, '');
    }
    return 'https://qarrib.onrender.com';
  }

  function getSocket() {
    if (socket && socket.connected) return socket;
    if (typeof io === 'undefined') return null;

    try {
      socket = io(getBackendUrl(), {
        auth: { token: localStorage.getItem('token') },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: maxReconnectAttempts,
        reconnectionDelay: reconnectDelay,
        timeout: 10000
      });

      socket.on('connect', function () {
        reconnectAttempts = 0;
        if (listeners.connect) {
          listeners.connect.forEach(function (cb) { cb(); });
        }
      });

      socket.on('connect_error', function (err) {
        reconnectAttempts++;
        if (listeners.connect_error) {
          listeners.connect_error.forEach(function (cb) { cb(err); });
        }
      });

      socket.on('disconnect', function () {
        if (listeners.disconnect) {
          listeners.disconnect.forEach(function (cb) { cb(); });
        }
      });

      return socket;
    } catch (e) {
      return null;
    }
  }

  function on(event, callback) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(callback);
    var s = getSocket();
    if (s) s.on(event, callback);
  }

  function emit(event, data) {
    var s = getSocket();
    if (s) s.emit(event, data);
  }

  function disconnect() {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  }

  window.QarribSocket = {
    getSocket: getSocket,
    on: on,
    emit: emit,
    disconnect: disconnect,
    isConnected: function () { return socket && socket.connected; }
  };
})();
