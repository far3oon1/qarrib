// Auth Utilities
function isLoggedIn() {
    return !!localStorage.getItem('token');
}

function getUser() {
    try {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    } catch (e) {
        return null;
    }
}

function getRole() {
    const user = getUser();
    return user ? user.role : null;
}

function setUser(user) {
    if (!user) return;
    localStorage.setItem('user', JSON.stringify(user));
}

function clearAuth() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
}

function redirectToLogin() {
    window.location.href = '/login.html';
}

function redirectBasedOnRole() {
    const role = getRole();
    if (role === 'patient') {
        window.location.href = '/patient/dashboard.html';
    } else if (role === 'nurse') {
        window.location.href = '/nurse/dashboard.html';
    } else if (role === 'admin') {
        window.location.href = '/admin/dashboard.html';
    } else if (role === 'assistant') {
        window.location.href = '/admin/assistant-panel.html';
    } else {
        redirectToLogin();
    }
}

function requireAuth() {
    if (!isLoggedIn()) {
        redirectToLogin();
        return false;
    }
    return true;
}

function requireRole(role) {
    if (!requireAuth()) return false;
    if (getRole() !== role) {
        redirectBasedOnRole();
        return false;
    }
    return true;
}

// Allow a page for several roles (e.g. admin + assistant share a panel
// while sensitive buttons stay admin-only via requireAdmin()).
function requireAnyRole(roles) {
    if (!requireAuth()) return false;
    if (roles.indexOf(getRole()) === -1) {
        redirectBasedOnRole();
        return false;
    }
    return true;
}

function isAdmin() {
    return getRole() === 'admin';
}

function isAssistant() {
    return getRole() === 'assistant';
}

function getAssistantScopes() {
    const user = getUser();
    if (!user || user.role !== 'assistant') return [];
    return Array.isArray(user.assistantScopes) ? user.assistantScopes : [];
}

function hasScope(scope) {
    if (isAdmin()) return true;
    return getAssistantScopes().indexOf(scope) !== -1;
}

function logout() {
    clearAuth();
    if (typeof api !== 'undefined' && api.logout) {
        api.logout().catch(function() {});
    }
    window.location.href = '/login.html';
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('ar-EG', {
        style: 'currency',
        currency: 'EGP'
    }).format(amount);
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showAlert(message, type = 'success') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;

    const container = document.querySelector('.app-container') || document.body;
    container.insertBefore(alertDiv, container.firstChild);

    setTimeout(() => alertDiv.remove(), 5000);
}

function showLoading(element) {
    element.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
}

function loadScriptOnce(id, src, isLoaded) {
    if (isLoaded()) return Promise.resolve();
    var existing = document.getElementById(id);
    if (existing) {
        return new Promise(function(resolve, reject) {
            existing.addEventListener('load', resolve, { once: true });
            existing.addEventListener('error', reject, { once: true });
        });
    }
    return new Promise(function(resolve, reject) {
        var script = document.createElement('script');
        script.id = id;
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function initializeAdminCallReceiver() {
    if (!isLoggedIn() || getRole() !== 'admin') return;
    var host = String(window.location.hostname || '').toLowerCase();
    var apiHost = '';
    try { apiHost = new URL(api.baseURL, window.location.href).hostname.toLowerCase(); } catch (e) {}
    var useApiSignaling = host.endsWith('.vercel.app') || host.endsWith('.github.io') || apiHost.endsWith('.vercel.app');
    var socketClientUrl = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
    var socketUrl = new URL('../js/socket.js', window.location.href).href;
    var callUrl = new URL('../js/call.js?v=4', window.location.href).href;
    var loadCallClient = function() {
        return loadScriptOnce('qarrib-call-client', callUrl, function() {
            return !!window.QarribCall && window.QarribCall.version >= 4 && typeof window.QarribCall.initialize === 'function';
        });
    };
    var initializeCallClient = function() { window.QarribCall.initialize(); };

    if (useApiSignaling) {
        loadCallClient().then(initializeCallClient).catch(function(error) {
            console.error('Unable to initialize admin call receiver:', error);
        });
        return;
    }

    loadScriptOnce('qarrib-socket-client', socketClientUrl, function() { return typeof io !== 'undefined'; })
        .then(function() {
            return loadScriptOnce('qarrib-socket-helper', socketUrl, function() { return !!window.QarribSocket; });
        })
        .then(loadCallClient)
        .then(initializeCallClient)
        .catch(function(error) {
            console.error('Unable to initialize admin call receiver:', error);
        });
}

// Check auth on page load
document.addEventListener('DOMContentLoaded', async function() {
    initializeAdminCallReceiver();
    if (isLoggedIn()) {
        try {
            var result = await api.getMe();
            if (result.success && result.data) {
                setUser(result.data.user || result.data);
            } else {
                clearAuth();
            }
        } catch (error) {
            var rawMsg = String((error && error.message) || '');
            // Blocked by admin (device/account) -> kick to sign-in with the
            // blocked-for-rules banner, so the user always sees WHY.
            if (/blocked|تم حظر|مخالفة قواعد/i.test(rawMsg)) {
                clearAuth();
                try {
                    var here = window.location.pathname || '';
                    if (here.indexOf('login.html') === -1 && here.indexOf('register.html') === -1) {
                        window.location.href = '/login.html?blocked=1';
                    }
                } catch (e) {}
                return;
            }
            // Log out only on real authentication failures (expired/invalid
            // token, deleted user) — never on transient network/server errors.
            var msg = rawMsg.toLowerCase();
            if (/(^|[^0-9])401([^0-9]|$)|unauthorized|no token|user not found|jwt expired|invalid token|invalid signature/.test(msg)) {
                clearAuth();
            }
        }
    }
});
