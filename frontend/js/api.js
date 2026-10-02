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

    // Capacitor native apps (Play Store / App Store builds) run from
    // capacitor://localhost, so same-origin would be dead — always use the
    // live Vercel API online.
    try {
        if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) {
            return configuredUrl ? configuredUrl.replace(/\/$/, '') + '/api' : 'https://qarrib1.vercel.app/api';
        }
    } catch (e) {}
    if (currentHost === 'localhost' && protocol.indexOf('capacitor') === 0) {
        return 'https://qarrib1.vercel.app/api';
    }

    // Prefer same-origin requests whenever the frontend is served by the backend itself.
    if (IS_DESKTOP) {
        return '/api';
    }
    if (currentHost === 'localhost' || currentHost === '127.0.0.1' || currentHost === '0.0.0.0' || currentOrigin === 'http://localhost:5000' || currentOrigin === 'http://127.0.0.1:5000') {
        return currentOrigin ? currentOrigin + '/api' : 'http://localhost:5000/api';
    }
    if (currentHost.endsWith('.github.io')) {
        return 'https://qarrib1.vercel.app/api';
    }
    if (currentHost === 'qarrib.onrender.com' || currentHost.endsWith('.onrender.com')) {
        return currentOrigin ? currentOrigin + '/api' : 'https://qarrib.onrender.com/api';
    }
    if (currentHost.endsWith('.vercel.app')) {
        // Frontend + API are served from the SAME Vercel deployment
        return currentOrigin ? currentOrigin + '/api' : 'https://qarrib1.vercel.app/api';
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
// Device tracking (the "MAC replacement").
// Browsers never expose a real MAC address, so we generate one stable UUID
// per browser (localStorage `qarrib_device_id`) and send it on EVERY request
// as X-Device-Id + X-Device-Platform. The backend records it at
// register/login and the admin can block/unblock it from the Devices page.
function getQarribDeviceId() {
    try {
        var id = localStorage.getItem('qarrib_device_id');
        if (!id) {
            id = 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
            localStorage.setItem('qarrib_device_id', id);
        }
        return id;
    } catch (e) {
        return 'dev-anon-' + Math.random().toString(36).slice(2, 10);
    }
}
function getQarribPlatform() {
    try {
        if (window.Capacitor && window.Capacitor.getPlatform) return 'capacitor-' + window.Capacitor.getPlatform();
    } catch (e) {}
    return (navigator && navigator.platform ? navigator.platform : 'web').slice(0, 60);
}

function getQarribLanguage() {
    try {
        return window.qarribLanguage || window.getQarribLanguage?.() || localStorage.getItem('qarrib-language') || document.documentElement.lang || 'ar';
    } catch (e) { return (document.documentElement && document.documentElement.lang) || 'ar'; }
}
function qarribLangHeaders() {
    var lang = (getQarribLanguage() === 'en') ? 'en' : 'ar';
    return { 'Accept-Language': lang, 'X-Lang': lang };
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
    var langHeaders = qarribLangHeaders();
    headers['Accept-Language'] = langHeaders['Accept-Language'];
    headers['X-Lang'] = langHeaders['X-Lang'];
    try {
        headers['X-Device-Id'] = getQarribDeviceId();
        headers['X-Device-Platform'] = getQarribPlatform();
    } catch (e) {}
    if (this.token) {
        headers['Authorization'] = 'Bearer ' + this.token;
    }
    return headers;
};

API.prototype.request = function (method, endpoint, data, isFormData) {
    var self = this;
    var url = self.baseURL + endpoint;
    var headers = isFormData ? {} : self.getHeaders();
    var langHeaders = qarribLangHeaders();
    headers['Accept-Language'] = langHeaders['Accept-Language'];
    headers['X-Lang'] = langHeaders['X-Lang'];
    try {
        headers['X-Device-Id'] = getQarribDeviceId();
        headers['X-Device-Platform'] = getQarribPlatform();
    } catch (e) {}
    if (isFormData && self.token) {
        headers['Authorization'] = 'Bearer ' + self.token;
    }
    // For FormData (register with photos) also append device fields into the body
    if (data && isFormData && typeof FormData !== 'undefined' && data instanceof FormData) {
        try {
            if (!data.has('deviceId')) data.append('deviceId', getQarribDeviceId());
            if (!data.has('devicePlatform')) data.append('devicePlatform', getQarribPlatform());
        } catch (e) {}
    } else if (data && !isFormData && typeof data === 'object') {
        // For JSON auth calls make sure deviceId travels in the body too
        if (!data.deviceId) {
            try { data.deviceId = getQarribDeviceId(); } catch (e) {}
        }
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
API.prototype.assistantLogin = function (data) {
    var self = this;
    return this.request('POST', '/auth/assistant/login', data).then(function (result) {
        if (result.success && result.data && result.data.token) {
            self.setToken(result.data.token);
        }
        return result;
    });
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
API.prototype.getAdminContact = function () {
    return this.request('GET', '/auth/admin/contact');
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
API.prototype.updateNurseLocation = function (lat, lng, orderId) {
    return this.request('POST', '/nurses/location', { lat: lat, lng: lng, orderId: orderId });
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
API.prototype.getAvailableRequests = function (lat, lng) {
    var q = (lat != null && lng != null) ? '?lat=' + encodeURIComponent(lat) + '&lng=' + encodeURIComponent(lng) : '';
    return this.request('GET', '/nurses/requests' + q);
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
API.prototype.acceptSuggestedPrice = function (orderId) {
    return this.request('POST', '/orders/' + orderId + '/accept-price');
};
// Nurse taps "I arrived" -> patient gets bell + live banner
API.prototype.arriveOrder = function (orderId) {
    return this.request('POST', '/orders/' + orderId + '/arrive', {});
};
// Nurse visit report (what was done) -> shown to admin on Feedbacks
API.prototype.submitVisitReport = function (orderId, summary) {
    return this.request('POST', '/orders/' + orderId + '/report', { summary: summary });
};
// In-app call with plan priority (Free: 3/order, subscribers: unlimited)
API.prototype.logCall = function (orderId) {
    return this.request('POST', '/orders/' + orderId + '/call', {});
};
API.prototype.getCallQuota = function (orderId) {
    return this.request('GET', '/orders/' + orderId + '/call-quota');
};
// Audit log (admin panel only)
API.prototype.getAuditLog = function (query) {
    if (query === undefined) query = '';
    return this.request('GET', '/admin/audit-log' + query);
};
API.prototype.respondToAssignment = function (orderId, accept) {
    return this.request('POST', '/orders/' + orderId + '/respond', { accept: accept });
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
API.prototype.getAdminOrderPayments = function () {
    return this.request('GET', '/admin/order-payments');
};
API.prototype.reviewOrderPayment = function (id, action) {
    return this.request('POST', '/admin/order-payments/' + id, { action: action });
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
API.prototype.getDirectContacts = function () {
    return this.request('GET', '/chat/direct/contacts');
};
API.prototype.getDirectMessages = function (userId) {
    return this.request('GET', '/chat/direct/' + userId);
};
API.prototype.sendDirectMessage = function (userId, content) {
    return this.request('POST', '/chat/direct/' + userId + '/send', { content: content });
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
API.prototype.getServicePrices = function () {
    // baseURL already ends in /api, so the path must not repeat it
    return this.request('GET', '/services');
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
API.prototype.adminCreateUser = function (data) {
    return this.request('POST', '/admin/users', data);
};
API.prototype.adminDeleteUser = function (id) {
    return this.request('DELETE', '/admin/users/' + id);
};
// Admin vault: full credentials + registration info (decrypted, admin panel only)
API.prototype.getUserCredentials = function (id) {
    return this.request('GET', '/admin/users/' + id + '/credentials');
};
// Admin online edit of ANY account field
API.prototype.updateUserFull = function (id, data) {
    return this.request('PUT', '/admin/users/' + id + '/full', data);
};
// Helper / assistant accounts (admin creates with ticked policies)
API.prototype.getAssistants = function () {
    return this.request('GET', '/admin/assistants');
};
API.prototype.createAssistant = function (data) {
    return this.request('POST', '/admin/assistants', data);
};
API.prototype.updateAssistant = function (id, data) {
    return this.request('PUT', '/admin/assistants/' + id, data);
};
API.prototype.deleteAssistant = function (id) {
    return this.request('DELETE', '/admin/assistants/' + id);
};
// Admin accounts (admin panel only: add / remove / enable-disable)
API.prototype.getAdmins = function () {
    return this.request('GET', '/admin/admins');
};
API.prototype.createAdmin = function (data) {
    return this.request('POST', '/admin/admins', data);
};
API.prototype.deleteAdmin = function (id) {
    return this.request('DELETE', '/admin/admins/' + id);
};
API.prototype.toggleAdminStatus = function (id) {
    return this.request('PATCH', '/admin/admins/' + id + '/status', {});
};
// Devices (admin panel only: track at register/login, block/unblock by deviceId/IP)
API.prototype.getDevices = function (query) {
    if (query === undefined) query = '';
    return this.request('GET', '/admin/devices' + query);
};
API.prototype.getUserDevices = function (userId) {
    return this.request('GET', '/admin/users/' + userId + '/devices');
};
API.prototype.blockDevice = function (data) {
    return this.request('POST', '/admin/devices/block', data);
};
API.prototype.unblockDevice = function (data) {
    return this.request('POST', '/admin/devices/unblock', data);
};
API.prototype.deleteDevice = function (id) {
    return this.request('DELETE', '/admin/devices/' + id);
};
// Assistant workspace (masked — never returns registration secrets)
API.prototype.getAssistantMe = function () {
    return this.request('GET', '/assistant/me');
};
API.prototype.getAssistantUsers = function (query) {
    if (query === undefined) query = '';
    return this.request('GET', '/assistant/users' + query);
};
API.prototype.assistantToggleUser = function (id, isActive) {
    return this.request('PATCH', '/assistant/users/' + id + '/status', { isActive: isActive });
};
API.prototype.getAssistantOrders = function (query) {
    if (query === undefined) query = '';
    return this.request('GET', '/assistant/orders' + query);
};
API.prototype.getAssistantContacts = function () {
    return this.request('GET', '/assistant/chats/contacts');
};
API.prototype.getAssistantMessages = function (userId) {
    return this.request('GET', '/assistant/chats/' + userId);
};
API.prototype.sendAssistantMessage = function (userId, content) {
    return this.request('POST', '/assistant/chats/' + userId + '/send', { content: content });
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
API.prototype.setOrderPrice = function (orderId, price) {
    return this.request('POST', '/admin/orders/' + orderId + '/set-price', { price: price });
};
API.prototype.suggestOrderPrice = function (orderId, price) {
    return this.request('POST', '/admin/orders/' + orderId + '/suggest-price', { price: price });
};
API.prototype.approveService = function (orderId) {
    return this.request('POST', '/admin/orders/' + orderId + '/approve-service');
};
API.prototype.getAdminFeedbacks = function (query) {
    if (query === undefined) query = '';
    return this.request('GET', '/admin/feedbacks' + query);
};
API.prototype.getNurseReports = function (query) {
    if (query === undefined) query = '';
    return this.request('GET', '/admin/nurse-reports' + query);
};
API.prototype.toggleServiceApproval = function (serviceId, requireApproval) {
    return this.request('PATCH', '/admin/services/' + serviceId, { requireApproval: requireApproval });
};
API.prototype.getAllOffers = function (query) {
    if (query === undefined) query = '';
    return this.request('GET', '/admin/offers' + query);
};
API.prototype.rejectOffer = function (orderId, offerId, notes) {
    return this.request('POST', '/admin/orders/' + orderId + '/reject-offer', { offerId: offerId, notes: notes });
};
// Admin full order control: cancel / remove / change status (any state)
API.prototype.adminCancelOrder = function (orderId, reason) {
    return this.request('POST', '/orders/' + orderId + '/cancel', { reason: reason || 'Cancelled by admin' });
};
API.prototype.adminDeleteOrder = function (orderId) {
    return this.request('DELETE', '/admin/orders/' + orderId);
};
API.prototype.adminUpdateOrderStatus = function (orderId, status, notes) {
    return this.request('PATCH', '/admin/orders/' + orderId + '/status', { status: status, notes: notes });
};
API.prototype.getVersion = function () {
    return this.request('GET', '/health');
};
// Nurse ends visit on cash received (balance handed over)
API.prototype.completeCash = function (orderId, amount) {
    return this.request('POST', '/orders/' + orderId + '/complete-cash', { cashReceived: true, amount: amount });
};
// Device/legal consents + online location-sharing permission
API.prototype.getPermissionState = function () {
    return this.request('GET', '/permissions/required');
};
API.prototype.saveConsents = function (data) {
    return this.request('POST', '/permissions/consent', data);
};
API.prototype.getPermSettings = function () {
    return this.request('GET', '/permissions/admin/settings');
};
API.prototype.savePermSettings = function (data) {
    return this.request('PUT', '/permissions/admin/settings', data);
};
API.prototype.getUserPermissions = function (query) {
    if (query === undefined) query = '';
    return this.request('GET', '/permissions/admin/users' + query);
};
API.prototype.saveUserPermissions = function (id, data) {
    return this.request('PUT', '/permissions/admin/users/' + id, data);
};
// Subscriptions: Free / Pro (250) / VIP (500)
API.prototype.getPlans = function () {
    return this.request('GET', '/subscriptions/plans');
};
API.prototype.getMySubscription = function () {
    return this.request('GET', '/subscriptions/me');
};
API.prototype.subscribePlan = function (plan, method, reference, billing) {
    return this.request('POST', '/subscriptions/subscribe', { plan: plan, method: method, reference: reference, billing: billing || 'monthly' });
};
API.prototype.removeSubscription = function (userId) {
    return this.request('POST', '/subscriptions/admin/user/' + userId + '/remove', {});
};
API.prototype.cancelSubscription = function () {
    return this.request('POST', '/subscriptions/cancel', {});
};
API.prototype.getAllSubscriptions = function (query) {
    if (query === undefined) query = '';
    return this.request('GET', '/subscriptions/admin/all' + query);
};
API.prototype.reviewSubscription = function (id, action) {
    return this.request('POST', '/subscriptions/admin/' + id, { action: action });
};
API.prototype.savePlanPrices = function (data) {
    return this.request('PUT', '/subscriptions/admin/prices', data);
};

var api = new API();
if (typeof window !== 'undefined') {
    window.api = api;
    window.getQarribDeviceId = getQarribDeviceId;
    window.getQarribPlatform = getQarribPlatform;
    window.getQarribLanguage = getQarribLanguage;
    window.qarribLangHeaders = qarribLangHeaders;
    // Pick the right language string from a backend payload:
    // backend returns { message (ar), message_en } on success AND errors.
    window.pickLocalizedMessage = function (payload, fallback) {
        if (typeof window.localizeMessage === 'function') return window.localizeMessage(payload, fallback);
        if (!payload) return fallback || '';
        if (typeof payload === 'string') return payload;
        var lang = getQarribLanguage();
        if (lang === 'en') return payload.message_en || payload.message || fallback || '';
        return payload.message || payload.message_en || fallback || '';
    };
    window.API_BASE_URL = API_BASE_URL;

    if (typeof document !== 'undefined' && document.createElement) {
        var apiScript = document.currentScript;
        var languageScript = document.createElement('script');
                languageScript.src = apiScript && apiScript.src
                    ? apiScript.src.replace(/api\.js(?:\?.*)?$/, 'language.js?v=4')
                    : 'js/language.js?v=4';
        document.head.appendChild(languageScript);

        // Autofit v1: same responsive/platform behaviour on web, desktop & mobile installs
        (function loadAutofit() {
            function base() {
                if (apiScript && apiScript.src) {
                    if (/autofit\.js/.test(apiScript.src)) return null; // already loaded explicitly
                    var m = apiScript.src.replace(/api\.js(?:\?.*)?$/, 'autofit.js?v=1');
                    if (m !== apiScript.src) return m;
                }
                var path = window.location.pathname || '/';
                var depth = (path.match(/\//g) || []).length - 1;
                return (depth >= 1 ? '../'.repeat(depth) : '') + 'js/autofit.js?v=1';
            }
            var src = base();
            if (src && !document.querySelector('script[src*="autofit.js"]')) {
                var s = document.createElement('script');
                s.src = src;
                s.defer = true;
                document.head.appendChild(s);
            }
            if (!document.querySelector('link[href*="autofit.css"]')) {
                var cssSrc = src ? src.replace(/js\/autofit\.js.*$/, 'css/autofit.css?v=1') : 'css/autofit.css?v=1';
                var l = document.createElement('link');
                l.rel = 'stylesheet';
                l.href = cssSrc;
                document.head.appendChild(l);
            }
            // viewport-fit=cover upgrade for installed notch devices (no-op if already set)
            try {
                var vp = document.querySelector('meta[name="viewport"]');
                if (vp && vp.content.indexOf('viewport-fit') === -1) {
                    vp.content = vp.content.replace(/,\s*$/, '') + ', viewport-fit=cover';
                }
            } catch (e) {}
        })();

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
            themeColor.content = '#0B5F5A';
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
