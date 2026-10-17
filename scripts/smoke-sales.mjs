/**
 * Smoke: login → checkout → stock → void → stock
 * Requiere: npm run db:up + API en LOCAL_API_PORT (3032)
 */
const API = (process.env.VITE_API_URL || process.env.VITE_LOCAL_API_URL || 'http://localhost:3032').replace(
  /\/$/,
  ''
);

async function json(res) {
  return res.json().catch(() => ({}));
}

async function main() {
  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: 'admin@caloricofit.com',
      password: 'Calorico123*2026',
    }),
  });
  const loginBody = await json(loginRes);
  if (!loginRes.ok) {
    console.error('Login failed', loginBody);
    process.exit(1);
  }
  const token = loginBody.session?.access_token;
  if (!token) {
    console.error('No session token');
    process.exit(1);
  }
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const prodRes = await fetch(`${API}/db`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      table: 'products',
      action: 'select',
      select: 'id, name, stock_quantity',
      filters: [{ op: 'eq', col: 'is_active', val: true }],
      limit: 1,
    }),
  });
  const prodBody = await json(prodRes);
  const product = prodBody.data?.[0] || prodBody.data;
  if (!product?.id) {
    console.error('No product for smoke', prodBody);
    process.exit(1);
  }
  const stockBefore = Number(product.stock_quantity);

  const custRes = await fetch(`${API}/db`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      table: 'customers',
      action: 'select',
      select: 'id',
      limit: 1,
    }),
  });
  const custBody = await json(custRes);
  const customer = custBody.data?.[0] || custBody.data;
  if (!customer?.id) {
    console.error('No customer for smoke', custBody);
    process.exit(1);
  }

  const allyBeforeRes = await fetch(`${API}/db`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      table: 'worker_profiles',
      action: 'select',
      select: 'id, ally_points, promo_code',
      filters: [{ op: 'eq', col: 'promo_code', val: 'ALIADO1' }],
      single: true,
    }),
  });
  const allyBeforeBody = await json(allyBeforeRes);
  const ally = allyBeforeBody.data;
  if (!ally?.id) {
    console.error('No ally ALIADO1 — aplica db/smoke/05_ally_alliances.sql', allyBeforeBody);
    process.exit(1);
  }
  const allyPtsBefore = Number(ally.ally_points || 0);

  const prodPtsRes = await fetch(`${API}/db`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      table: 'products',
      action: 'select',
      select: 'ally_points_per_unit',
      filters: [{ op: 'eq', col: 'id', val: product.id }],
      single: true,
    }),
  });
  const prodPtsBody = await json(prodPtsRes);
  const ptsPerUnit = Number(prodPtsBody.data?.ally_points_per_unit || 0);

  const checkoutRes = await fetch(`${API}/sales/checkout`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      sale: {
        customer_id: customer.id,
        subtotal_usd: 10,
        discount_usd: 0,
        surcharge_usd: 0,
        total_usd: 10,
        payment_method: 'CASH USD',
        currency_used: 'USD',
        exchange_rate_applied: 1,
        points_earned: 0,
        points_redeemed: 0,
        is_wholesale: false,
      },
      promo_code: 'ALIADO1',
      items: [
        {
          product_id: product.id,
          quantity: 1,
          unit_price_usd: 10,
          subtotal_usd: 10,
        },
      ],
    }),
  });
  const checkoutBody = await json(checkoutRes);
  if (!checkoutRes.ok || !checkoutBody.data?.id) {
    console.error('Checkout failed', checkoutBody);
    process.exit(1);
  }
  const saleId = checkoutBody.data.id;
  const earned = Number(checkoutBody.data.ally_points_earned || 0);
  if (earned !== ptsPerUnit) {
    console.error(`Ally points earned expected ${ptsPerUnit}, got ${earned}`);
    process.exit(1);
  }

  const afterRes = await fetch(`${API}/db`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      table: 'products',
      action: 'select',
      select: 'stock_quantity',
      filters: [{ op: 'eq', col: 'id', val: product.id }],
      single: true,
    }),
  });
  const afterBody = await json(afterRes);
  const stockAfterSale = Number(afterBody.data?.stock_quantity);
  if (stockAfterSale !== stockBefore - 1) {
    console.error(`Stock expected ${stockBefore - 1}, got ${stockAfterSale}`);
    process.exit(1);
  }

  const voidRes = await fetch(`${API}/sales/${saleId}/void`, {
    method: 'POST',
    headers: auth,
  });
  const voidBody = await json(voidRes);
  if (!voidRes.ok) {
    console.error('Void failed', voidBody);
    process.exit(1);
  }

  const finalRes = await fetch(`${API}/db`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      table: 'products',
      action: 'select',
      select: 'stock_quantity',
      filters: [{ op: 'eq', col: 'id', val: product.id }],
      single: true,
    }),
  });
  const finalBody = await json(finalRes);
  const stockFinal = Number(finalBody.data?.stock_quantity);
  if (stockFinal !== stockBefore) {
    console.error(`Stock after void expected ${stockBefore}, got ${stockFinal}`);
    process.exit(1);
  }

  const allyAfterRes = await fetch(`${API}/db`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      table: 'worker_profiles',
      action: 'select',
      select: 'ally_points',
      filters: [{ op: 'eq', col: 'id', val: ally.id }],
      single: true,
    }),
  });
  const allyAfterBody = await json(allyAfterRes);
  const allyPtsFinal = Number(allyAfterBody.data?.ally_points || 0);
  if (allyPtsFinal !== allyPtsBefore) {
    console.error(`Ally points after void expected ${allyPtsBefore}, got ${allyPtsFinal}`);
    process.exit(1);
  }

  console.log('smoke:sales OK — checkout, stock, void, ally points');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
