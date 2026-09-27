// Qarrib API Client (ES5 syntax for maximum browser compatibility)
// The backend serves API + frontend from the SAME origin, so whenever the
// page itself came over http(s) from the backend (port 5000, default ports,
// Cloudflare tunnel https, Render https...) we use same-origin /api.
// A hosted static frontend may set window.QARRAB_API_URL before this script loads.
var IS_DESKTOP = typeof window.desktopAPI !== 'undefined' || window.isDesktopApp === true || (typeof process !== 'undefined' && process.type === 'renderer');
var API_BASE_URL = (function () {
    var configuredUrl = typeof window.QARRAB_API_URL === 'string' ? window.QARRAB_API_URL.trim() : '';
    var currentHost = (window.location && window.location.hostname) ? window.location.hostname.toLowerCase() : '';
    var currentOrigin = window.location && window.location.origin ? window.location.origin : '';
    var protocol = String(window.location && window.location.protocol ? window.location.protocol : '');

    // Prefer same-origin requests whenever the frontend is served by the backend itself.
    if (IS_DESKTOP) {
        return '/api';
    }
    if (currentHost === 'localhost' || currentHost === '127.0.0.1' || currentHost === '0.0.0.0' || currentOrigin === 'http://localhost:5000' || currentOrigin === 'http://127.0.0.1:5000') {
        return currentOrigin ? currentOrigin + '/api' : 'http://localhost:5000/api';
    }
    if (currentHost.endsWith('.github.io')) {
        return 'https://qarrib.onrender.com/api';
    }
    if (currentHost === 'qarrib.onrender.com' || currentHost.endsWith('.onrender.com')) {
        return currentOrigin ? currentOrigin + '/api' : 'https://qarrib.onrender.com/api';
    }
    if (currentHost === 'qarrib1.vercel.app' || currentHost.endsWith('.vercel.app')) {
        return 'https://qarrib.onrender.com/api';
    }
    if (configuredUrl) {
        return configuredUrl.replace(/\/$/, '') + '/api';
    }
    if (protocol.indexOf('http') === 0) {
        var port = String(window.location.port || '');
        if (port === '' || port === '5000') {
            return (currentOrigin || 'http://localhost:5000') + '/api';
        }
        var host = window.location.hostname || 'localhost';
        return protocol + '//' + host + ':5000/api';
    }
    return 'http://localhost:5000/api';
})();

function safeGetToken() {
    try { return localStorage.getItem('token'); } catch (e) { return null; }
}
function safeSetToken(t) {
    try { localStorage.setItem('token', t); } catch (e) {}
}
function safeRemoveToken() {
    try { localStorage.removeItem('token'); } catch (e) {}
}

function API() {
    this.baseURL = API_BASE_URL;
    this.token = safeGetToken();
}

API.prototype.setToken = function (token) {
    this.token = token;
    safeSetToken(token);
};

API.prototype.clearToken = function () {
    this.token = null;
    safeRemoveToken();
};

API.prototype.getHeaders = function () {
    var headers = { 'Content-Type': 'application/json' };
    if (this.token) {
        headers['Authorization'] = 'Bearer ' + this.token;
    }
    return headers;
};

API.prototype.request = function (method, endpoint, data, isFormData) {
    var self = this;
    var url = self.baseURL + endpoint;
    var headers = isFormData ? {} : self.getHeaders();
    if (isFormData && self.token) {
        headers['Authorization'] = 'Bearer ' + self.token;
    }
    var options = { method: method, headers: headers };
    if (data && !isFormData) {
        options.body = JSON.stringify(data);
    } else if (data && isFormData) {
        options.body = data;
    }
    return fetch(url, options).then(function (response) {
        return response.text().then(function (body) {
            var result;
            var contentType = response.headers.get('content-type') || '';
            try {
                result = body ? JSON.parse(body) : {};
            } catch (parseError) {
                var responseType = contentType.indexOf('text/html') !== -1 ? 'HTML' : 'invalid JSON';
                throw new Error('API returned ' + responseType + ' from ' + response.url + '. Check that the backend URL and port are correct.');
            }
            if (!response.ok) {
                throw new Error((result && result.message) || 'Request failed');
            }
            return result;
        });
    }).catch(function (error) {
        if (typeof console !== 'undefined') console.error('API Error:', error);
        throw error;
    });
};

// Auth
API.prototype.registerPatient = function (data) {
    return this.request('POST', '/auth/register/patient', data);
};
API.prototype.registerNurse = function (data) {
    return this.request('POST', '/auth/register/nurse', data);
};
API.prototype.login = function (data) {
    var self = this;
    return this.request('POST', '/auth/login', data).then(function (result) {
        if (result.success && result.data && result.data.token) {
            self.setToken(result.data.token);
        }
        return result;
    });
};
API.prototype.adminLogin = function (data) {
    var self = this;
    var payload = Object.assign({}, data, { secretKey: data.secretKey || '' });
    return this.request('POST', '/auth/admin/login', payload).then(function (result) {
        if (result.success && result.data && result.data.token) {
            self.setToken(result.data.token);
        }
        return result;
    });
};
API.prototype.adminRegister = function (data) {
    var payload = Object.assign({}, data, { secretKey: data.secretKey || '' });
    return this.request('POST', '/auth/admin/register', payload);
};
API.prototype.adminResetPassword = function (data) {
    return this.request('POST', '/auth/admin/reset-password', data);
};
API.prototype.logout = function () {
    var self = this;
    return this.request('POST', '/auth/logout').then(function (r) {
        self.clearToken();
        return r;
    }, function (e) {
        self.clearToken();
        throw e;
    });
};
API.prototype.getMe = function () {
    return this.request('GET', '/auth/me');
};
API.prototype.uploadDocuments = function (formData) {
    return this.request('POST', '/auth/upload-documents', formData, true);
};

// Patient
API.prototype.getPatientDashboard = function () {
    return this.request('GET', '/patients/dashboard');
};
API.prototype.updatePatientProfile = function (data) {
    return this.request('PUT', '/patients/profile', data);
};
API.prototype.updateLocation = function (lat, lng) {
    return this.request('POST', '/patients/location', { lat: lat, lng: lng });
};
API.prototype.getPatientOrders = function () {
    return this.request('GET', '/patients/orders');
};
API.prototype.getPatientWallet = function () {
  return this.request('GET', '/patients/wallet');
};
API.prototype.getPatientNurses = function () {
  return this.request('GET', '/patients/nurses');
};
API.prototype.getNearbyNurses = function (lat, lng, distance) {
  if (distance === undefined) distance = 10;
  return this.request('GET', '/patients/nearby-nurses?lat=' + lat + '&lng=' + lng + '&distance=' + distance);
};
API.prototype.getOrdersWithOffers = function () {
  return this.request('GET', '/patients/orders-with-offers');
};

// Nurse
API.prototype.getNurseDashboard = function () {
    return this.request('GET', '/nurses/dashboard');
};
API.prototype.updateNurseProfile = function (data) {
    return this.request('PUT', '/nurses/profile', data);
};
API.prototype.getAvailableRequests = function () {
    return this.request('GET', '/nurses/requests');
};
API.prototype.getNurseOrders = function () {
    return this.request('GET', '/nurses/orders');
};
API.prototype.getNurseWallet = function () {
    return this.request('GET', '/nurses/wallet');
};
API.prototype.toggleOnlineStatus = function () {
    return this.request('POST', '/nurses/toggle-status');
};

// Orders
API.prototype.createOrder = function (data) {
    return this.request('POST', '/orders/create', data);
};
API.prototype.acceptOrder = function (orderId) {
    return this.request('POST', '/orders/' + orderId + '/accept');
};
API.prototype.startService = function (orderId) {
    return this.request('POST', '/orders/' + orderId + '/start');
};
API.prototype.confirmOrder = function (orderId, role) {
    return this.request('POST', '/orders/' + orderId + '/confirm', { role: role });
};
API.prototype.cancelOrder = function (orderId, reason) {
    return this.request('POST', '/orders/' + orderId + '/cancel', { reason: reason });
};
API.prototype.getOrder = function (orderId) {
    return this.request('GET', '/orders/' + orderId);
};
API.prototype.rateOrder = function (orderId, rating, review) {
    return this.request('POST', '/orders/' + orderId + '/rate', { rating: rating, review: review });
};
API.prototype.submitOffer = function (orderId, price, notes) {
    return this.request('POST', '/orders/' + orderId + '/offer', { price: price, notes: notes });
};
API.prototype.approveOffer = function (orderId, offerId) {
    return this.request('POST', '/orders/' + orderId + '/approve-offer', { offerId: offerId });
};
API.prototype.payManual = function (orderId, data) {
    return this.request('POST', '/orders/' + orderId + '/pay', data);
};
API.prototype.getOwnerAccount = function () {
    return this.request('GET', '/payments/owner-account');
};
API.prototype.topupRequest = function (data) {
    return this.request('POST', '/wallet/topup', data);
};
API.prototype.getAdminTopups = function () {
    return this.request('GET', '/admin/topups');
};
API.prototype.reviewTopup = function (id, action) {
    return this.request('POST', '/admin/topups/' + id, { action: action });
};

// Payments
API.prototype.initiateCardPayment = function (data) {
    return this.request('POST', '/payments/card', data);
};
API.prototype.initiateWalletPayment = function (data) {
    return this.request('POST', '/payments/wallet', data);
};
API.prototype.initiateInstapayPayment = function (data) {
    return this.request('POST', '/payments/instapay', data);
};

// Wallet
API.prototype.getWallet = function () {
  return this.request('GET', '/wallet');
};
API.prototype.requestWithdrawal = function (data) {
  return this.request('POST', '/wallet/withdraw', data);
};
API.prototype.transferBalance = function (data) {
  return this.request('POST', '/wallet/transfer', data);
};
API.prototype.nurseTransfers = function () {
    return this.request('GET', '/nurses/transfers');
};

// Chat
API.prototype.getChatMessages = function (orderId) {
    return this.request('GET', '/chat/' + orderId);
};
API.prototype.getMyChats = function () {
    return this.request('GET', '/chat/my-chats');
};
API.prototype.sendMessage = function (orderId, content, type) {
    if (type === undefined) type = 'text';
    return this.request('POST', '/chat/' + orderId + '/send', { content: content, type: type });
};
API.prototype.sendLocation = function (orderId, lat, lng) {
    return this.request('POST', '/chat/' + orderId + '/location', { lat: lat, lng: lng });
};

// Admin
API.prototype.getPrices = function () {
    return this.request('GET', '/admin/prices');
};
API.prototype.setPrice = function (data) {
    return this.request('POST', '/admin/set-price', {
        serviceType: data.serviceType,
        price: data.price
    });
};
API.prototype.deletePrice = function (serviceId) {
    return this.request('DELETE', '/admin/price/' + serviceId);
};
API.prototype.getAdminDashboard = function () {
    return this.request('GET', '/admin/dashboard');
};
API.prototype.getNotifications = function (query) {
    if (query === undefined) query = '?limit=20';
    return this.request('GET', '/notifications' + query);
};
API.prototype.markNotificationRead = function (id) {
    return this.request('PATCH', '/notifications/' + id + '/read');
};
API.prototype.markAllNotificationsRead = function () {
    return this.request('PATCH', '/notifications/read-all');
};
API.prototype.getAdminWithdrawals = function () {
    return this.request('GET', '/admin/withdrawals');
};
API.prototype.reviewWithdrawal = function (id, action) {
    return this.request('POST', '/admin/withdrawals/' + id, { action: action });
};
API.prototype.adminApproveOffer = function (orderId, offerId) {
    return this.request('POST', '/admin/orders/' + orderId + '/approve-offer', { offerId: offerId });
};
API.prototype.getAdminEarnings = function () {
    return this.request('GET', '/admin/earnings');
};
API.prototype.resetPayments = function () {
    return this.request('POST', '/admin/reset-payments');
};
API.prototype.getAdminUsers = function (query) {
    if (query === undefined) query = '';
    return this.request('GET', '/admin/users' + query);
};
API.prototype.getAdminUser = function (id) {
    return this.request('GET', '/admin/users/' + id);
};
API.prototype.updateAdminUser = function (id, data) {
    return this.request('PUT', '/admin/users/' + id, data);
};
API.prototype.getPendingVerifications = function () {
    return this.request('GET', '/admin/verifications');
};
API.prototype.verifyDocument = function (id, status, notes) {
    return this.request('POST', '/admin/verifications/' + id, { status: status, notes: notes });
};
API.prototype.getAdminOrders = function (query) {
    if (query === undefined) query = '';
    return this.request('GET', '/admin/orders' + query);
};
API.prototype.getAdminPayments = function () {
    return this.request('GET', '/admin/payments');
};
API.prototype.completeOrderAdmin = function (id) {
    return this.request('POST', '/admin/orders/' + id + '/complete');
};
API.prototype.getVersion = function () {
    return this.request('GET', '/health');
};

var api = new API();
if (typeof window !== 'undefined') {
    window.api = api;
    window.API_BASE_URL = API_BASE_URL;

    if (typeof document !== 'undefined' && document.createElement) {
        var apiScript = document.currentScript;
        var languageScript = document.createElement('script');
        languageScript.src = apiScript && apiScript.src
            ? apiScript.src.replace(/api\.js(?:\?.*)?$/, 'language.js?v=3')
            : 'js/language.js?v=3';
        document.head.appendChild(languageScript);

        if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) {
            var nativeBridgeScript = document.createElement('script');
            nativeBridgeScript.src = '/js/native-bridge.js?v=1';
            document.head.appendChild(nativeBridgeScript);
        }

        if (!document.querySelector('link[rel="manifest"]')) {
            var manifestLink = document.createElement('link');
            manifestLink.rel = 'manifest';
            manifestLink.href = '/manifest.webmanifest';
            document.head.appendChild(manifestLink);
        }

        if (!document.querySelector('meta[name="theme-color"]')) {
            var themeColor = document.createElement('meta');
            themeColor.name = 'theme-color';
            themeColor.content = '#2563eb';
            document.head.appendChild(themeColor);
        }

        if (!document.querySelector('link[rel="apple-touch-icon"]')) {
            var touchIcon = document.createElement('link');
            touchIcon.rel = 'apple-touch-icon';
            touchIcon.href = '/icon-180.png';
            document.head.appendChild(touchIcon);
        }

        if ('serviceWorker' in navigator && window.isSecureContext) {
            window.addEventListener('load', function () {
                navigator.serviceWorker.register('/sw.js').catch(function (error) {
                    console.warn('Qarrib offline support could not start:', error);
                });
            });
        }

        var installPrompt = null;
        window.addEventListener('beforeinstallprompt', function (event) {
            event.preventDefault();
            installPrompt = event;
            if (document.getElementById('qarrib-install-button')) return;

            var installButton = document.createElement('button');
            installButton.id = 'qarrib-install-button';
            installButton.type = 'button';
            installButton.textContent = document.documentElement.lang === 'en' ? 'Install Qarrib' : 'تثبيت قرّب';
            installButton.style.cssText = 'position:fixed;left:16px;bottom:calc(76px + env(safe-area-inset-bottom, 0px));z-index:1000;border:0;border-radius:999px;padding:12px 16px;background:#0f766e;color:#fff;font:600 14px/1.2 system-ui,sans-serif;box-shadow:0 4px 14px rgba(15,23,42,.22);cursor:pointer;';
            installButton.addEventListener('click', function () {
                if (!installPrompt) return;
                installPrompt.prompt();
                installPrompt.userChoice.finally(function () {
                    installPrompt = null;
                    installButton.remove();
                });
            });
            document.body.appendChild(installButton);
        });

        window.addEventListener('appinstalled', function () {
            var installButton = document.getElementById('qarrib-install-button');
            if (installButton) installButton.remove();
        });
    }
}
