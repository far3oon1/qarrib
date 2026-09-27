const fetch = require('node-fetch');

// Paymob Configuration
const PAYMOB_CONFIG = {
    baseUrl: process.env.PAYMOB_BASE_URL || 'https://accept.paymob.com',
    apiKey: process.env.PAYMOB_API_KEY || '',
    secretKey: process.env.PAYMOB_SECRET_KEY || '',
    publicKey: process.env.PAYMOB_PUBLIC_KEY || '',
    hmacSecret: process.env.PAYMOB_HMAC_SECRET || '',
    iframeId: process.env.PAYMOB_IFRAME_ID || '',
    integrationIds: {
        card: process.env.PAYMOB_CARD_INTEGRATION_ID,
        wallet: process.env.PAYMOB_WALLET_INTEGRATION_ID,
        instapay: process.env.PAYMOB_INSTAPAY_INTEGRATION_ID
    }
};

// Cache for auth token
let cachedToken = null;
let tokenExpiry = null;

/**
 * Step 1: Get Authentication Token from Paymob
 */
async function getAuthToken() {
    // Return cached token if still valid (valid for 1 hour)
    if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
        return cachedToken;
    }

    try {
        const response = await fetch(`${PAYMOB_CONFIG.baseUrl}/api/auth/tokens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: PAYMOB_CONFIG.apiKey })
        });

        const data = await response.json();

        if (!response.ok || !data.token) {
            throw new Error(data.message || 'Failed to get auth token');
        }

        cachedToken = data.token;
        tokenExpiry = Date.now() + (55 * 60 * 1000); // Cache for 55 minutes
        return cachedToken;
    } catch (error) {
        console.error('Paymob Auth Error:', error.message);
        throw error;
    }
}

/**
 * Step 2: Register Order with Paymob
 */
async function registerOrder(authToken, orderData) {
    try {
        const response = await fetch(`${PAYMOB_CONFIG.baseUrl}/api/ecommerce/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                auth_token: authToken,
                delivery_needed: false,
                amount_cents: orderData.amountCents,
                currency: orderData.currency || 'EGP',
                merchant_order_id: orderData.merchantOrderId,
                items: orderData.items || [{
                    name: orderData.description || 'Nursing Service',
                    amount_cents: orderData.amountCents,
                    quantity: 1
                }]
            })
        });

        const data = await response.json();

        if (!response.ok || !data.id) {
            throw new Error(data.message || 'Failed to register order');
        }

        return data;
    } catch (error) {
        console.error('Paymob Order Registration Error:', error.message);
        throw error;
    }
}

/**
 * Step 3: Generate Payment Key
 */
async function generatePaymentKey(authToken, orderId, amountCents, billingData, integrationId) {
    try {
        const response = await fetch(`${PAYMOB_CONFIG.baseUrl}/api/acceptance/payment_keys`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                auth_token: authToken,
                amount_cents: amountCents,
                expiration: 3600, // 1 hour
                order_id: orderId,
                billing_data: {
                    apartment: billingData.apartment || 'NA',
                    email: billingData.email,
                    floor: billingData.floor || 'NA',
                    first_name: billingData.firstName,
                    street: billingData.street || 'NA',
                    building: billingData.building || 'NA',
                    phone_number: billingData.phone,
                    shipping_method: 'NA',
                    postal_code: billingData.postalCode || 'NA',
                    city: billingData.city || 'Cairo',
                    country: billingData.country || 'EG',
                    last_name: billingData.lastName,
                    state: billingData.state || 'NA'
                },
                currency: billingData.currency || 'EGP',
                integration_id: integrationId,
                lock_order_when_paid: true
            })
        });

        const data = await response.json();

        if (!response.ok || !data.token) {
            throw new Error(data.message || 'Failed to generate payment key');
        }

        return data;
    } catch (error) {
        console.error('Paymob Payment Key Error:', error.message);
        throw error;
    }
}

/**
 * Step 4: Create Card Payment (IFrame)
 */
async function createCardPayment(paymentData) {
    const authToken = await getAuthToken();
    const order = await registerOrder(authToken, paymentData);
    const paymentKey = await generatePaymentKey(
        authToken,
        order.id,
        paymentData.amountCents,
        paymentData.billingData,
        PAYMOB_CONFIG.integrationIds.card
    );

    return {
        paymentKey: paymentKey.token,
        orderId: order.id,
        iframeUrl: `${PAYMOB_CONFIG.baseUrl}/api/acceptance/iframes/${PAYMOB_CONFIG.iframeId}?payment_token=${paymentKey.token}`
    };
}

/**
 * Step 4: Create Mobile Wallet Payment (Vodafone Cash, etc.)
 */
async function createWalletPayment(paymentData) {
    const authToken = await getAuthToken();
    const order = await registerOrder(authToken, paymentData);
    const paymentKey = await generatePaymentKey(
        authToken,
        order.id,
        paymentData.amountCents,
        paymentData.billingData,
        PAYMOB_CONFIG.integrationIds.wallet
    );

    // Initiate wallet payment
    const walletResponse = await fetch(`${PAYMOB_CONFIG.baseUrl}/api/acceptance/payments/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            source: {
                identifier: paymentData.walletPhone,
                subtype: 'WALLET'
            },
            payment_token: paymentKey.token
        })
    });

    const walletData = await walletResponse.json();

    if (!walletResponse.ok) {
        throw new Error(walletData.message || 'Wallet payment initiation failed');
    }

    return {
        redirectUrl: walletData.redirect_url,
        paymobOrderId: order.id,
        paymentKey: paymentKey.token
    };
}

/**
 * Step 4: Create InstaPay Payment
 */
async function createInstapayPayment(paymentData) {
    const authToken = await getAuthToken();
    const order = await registerOrder(authToken, paymentData);
    const paymentKey = await generatePaymentKey(
        authToken,
        order.id,
        paymentData.amountCents,
        paymentData.billingData,
        PAYMOB_CONFIG.integrationIds.instapay
    );

    return {
        paymentKey: paymentKey.token,
        orderId: order.id,
        redirectUrl: `${PAYMOB_CONFIG.baseUrl}/api/acceptance/iframes/${PAYMOB_CONFIG.iframeId}?payment_token=${paymentKey.token}`
    };
}

/**
 * Verify Transaction
 */
async function verifyTransaction(transactionId) {
    try {
        const authToken = await getAuthToken();
        const response = await fetch(
            `${PAYMOB_CONFIG.baseUrl}/api/acceptance/transactions/${transactionId}`,
            {
                headers: { 'Authorization': `Bearer ${authToken}` }
            }
        );
        return await response.json();
    } catch (error) {
        console.error('Paymob Verify Error:', error.message);
        throw error;
    }
}

/**
 * Refund Transaction
 */
async function refundTransaction(transactionId, amountCents) {
    try {
        const authToken = await getAuthToken();
        const response = await fetch(
            `${PAYMOB_CONFIG.baseUrl}/api/acceptance/transactions/${transactionId}/refund`,
            {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ amount_cents: amountCents })
            }
        );
        return await response.json();
    } catch (error) {
        console.error('Paymob Refund Error:', error.message);
        throw error;
    }
}

module.exports = {
    PAYMOB_CONFIG,
    getAuthToken,
    registerOrder,
    generatePaymentKey,
    createCardPayment,
    createWalletPayment,
    createInstapayPayment,
    verifyTransaction,
    refundTransaction
};
