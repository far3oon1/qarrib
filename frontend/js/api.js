// Qarrib API Client (ES5 syntax for maximum browser compatibility)
// The backend serves API + frontend from the SAME origin, so whenever the
// page itself came over http(s) from the backend (port 5000, default ports,
// Cloudflare tunnel https, Render https...) we use same-origin /api.
// Only dev setups (file:// or Live Server :5500) fall back to host:5000.
var IS_DESKTOP = typeof window.desktopAPI !== 'undefined' || window.isDesktopApp === true || (typeof process !== 'undefined' && process.type === 'renderer');
var API_BASE_URL = (function () {
    if (IS_DESKTOP) {
        return '/api';
    }
    var protocol = String(window.location.protocol || '');
    var isHttp = protocol.indexOf('http') === 0;
    if (isHttp) {
        var port = String(window.location.port || '');
        if (port === '' || port === '5000') {
            return window.location.origin + '/api';
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
        return response.json().then(function (result) {
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
  return this.request('GET', '/nurse/transfers');
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
}
