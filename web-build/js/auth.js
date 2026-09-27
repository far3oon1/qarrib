// Auth Utilities
function isLoggedIn() {
    return !!localStorage.getItem('token');
}

function getUser() {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
}

function getRole() {
    const user = getUser();
    return user ? user.role : null;
}

function setUser(user) {
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

// Check auth on page load
document.addEventListener('DOMContentLoaded', async function() {
    if (isLoggedIn()) {
        try {
            var result = await api.getMe();
            if (result.success && result.data) {
                setUser(result.data.user || result.data);
            } else {
                clearAuth();
            }
        } catch (error) {
            if (error.message && error.message.indexOf('401') !== -1) {
                clearAuth();
            }
        }
    }
});
