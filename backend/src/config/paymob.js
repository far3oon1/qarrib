// Paymob helper.
// Works in two modes:
// - If PAYMOB_API_KEY etc. are set: uses real Paymob Accept API (same flow as legacy).
// - Otherwise (dev): returns deterministic mock data so the app flow can be
//   tested end-to-end without real keys (docs/PAYMOB_SETUP.md explains prod setup).
const hasKeys = () => Boolean(process.env.PAYMOB_API_KEY && process.env.PAYMOB_CARD_INTEGRATION_ID);

async function paymobRequest(path, body) {
  const base = process.env.PAYMOB_BASE_URL || 'https://accept.paymob.com';
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Paymob request failed: ${path}`);
  return data;
}

async function createPayment({ amountCents, merchantOrderId, description, billingData, integrationId, walletPhone }) {
  if (!hasKeys()) {
    // ---- DEV MOCK ----
    const fakeId = `mock_${Date.now()}`;
    return {
      mode: 'mock',
      paymobOrderId: fakeId,
      paymentKey: `mock_key_${fakeId}`,
      iframeUrl: `https://accept.paymob.com/api/acceptance/iframes/${process.env.PAYMOB_IFRAME_ID || 'mock'}?payment_token=mock_key_${fakeId}`,
      redirectUrl: null,
      merchantOrderId
    };
  }

  const auth = await paymobRequest('/api/auth/tokens', { api_key: process.env.PAYMOB_API_KEY });
  const order = await paymobRequest('/api/ecommerce/orders', {
    auth_token: auth.token,
    delivery_needed: false,
    amount_cents: amountCents,
    currency: 'EGP',
    merchant_order_id: merchantOrderId,
    items: [{ name: description || 'Nursing Service', amount_cents: amountCents, quantity: 1 }]
  });
  const keyPayload = {
    auth_token: auth.token,
    amount_cents: amountCents,
    expiration: 3600,
    order_id: order.id,
    billing_data: {
      apartment: 'NA',
      email: billingData.email,
      floor: 'NA',
      first_name: billingData.firstName,
      street: billingData.street || 'NA',
      building: 'NA',
      phone_number: billingData.phone,
      shipping_method: 'NA',
      postal_code: 'NA',
      city: billingData.city || 'Cairo',
      country: billingData.country || 'EG',
      last_name: billingData.lastName,
      state: 'NA'
    },
    currency: 'EGP',
    integration_id: Number(integrationId)
  };
  if (walletPhone) keyPayload.payment_source = { identifier: walletPhone, subtype: 'WALLET' };
  const keyRes = await paymobRequest('/api/acceptance/payment_keys', keyPayload);

  const iframeId = process.env.PAYMOB_IFRAME_ID || '';
  return {
    mode: 'live',
    paymobOrderId: String(order.id),
    paymentKey: keyRes.token,
    iframeUrl: iframeId ? `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${keyRes.token}` : null,
    redirectUrl: keyRes.redirect_url || null,
    merchantOrderId
  };
}

const createCardPayment = (data) => createPayment({
  ...data,
  integrationId: process.env.PAYMOB_CARD_INTEGRATION_ID
});

const createWalletPayment = (data) => createPayment({
  ...data,
  integrationId: process.env.PAYMOB_WALLET_INTEGRATION_ID
});

const createInstapayPayment = (data) => createPayment({
  ...data,
  integrationId: process.env.PAYMOB_INSTAPAY_INTEGRATION_ID || process.env.PAYMOB_CARD_INTEGRATION_ID
});

module.exports = {
  hasKeys,
  createCardPayment,
  createWalletPayment,
  createInstapayPayment
};
