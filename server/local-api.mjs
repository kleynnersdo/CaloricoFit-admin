import express from 'express';
import cors from 'cors';
import pg from 'pg';
import crypto from 'node:crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const { Pool } = pg;
const PORT = Number(process.env.LOCAL_API_PORT || 3032);
const HOST = process.env.LOCAL_API_HOST || '127.0.0.1';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://calorico:calorico_smoke@localhost:15433/caloricofit',
});

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));

// CORS: en dev refleja cualquier origen; en VPS fijar CORS_ORIGINS (lista separada por comas).
const CORS_ORIGINS = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(CORS_ORIGINS.length ? cors({ origin: CORS_ORIGINS }) : cors({ origin: true }));

app.use(express.json({ limit: '2mb' }));

// Anti fuerza bruta sobre el login (15 intentos / 15 min / IP).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Espera unos minutos.' },
});

const IDENT_RE = /^[a-z0-9_]+$/i;

function httpError(status, message) {
  const e = new Error(message);
  e.httpStatus = status;
  return e;
}

// ---------------------------------------------------------------------------
// Autorización por tabla/acción para /db
//   'auth'   → cualquier usuario autenticado
//   'self'   → autenticado, pero sellers solo ven su propia fila
//   'admin'  → solo rol admin
//   'server' → prohibido por /db; usar endpoint dedicado
// ---------------------------------------------------------------------------
const TABLE_RULES = {
  worker_profiles: {
    select: 'self', insert: 'admin', update: 'admin', upsert: 'admin', delete: 'admin',
    hiddenCols: ['password'],
  },
  settings: { select: 'auth', insert: 'admin', update: 'admin', upsert: 'admin', delete: 'admin' },
  products: {
    select: 'auth', insert: 'admin', update: 'admin', upsert: 'admin', delete: 'admin',
    sellerHiddenCols: ['cost_price'],
  },
  product_categories: { select: 'auth', insert: 'admin', update: 'admin', upsert: 'admin', delete: 'admin' },
  customers: { select: 'auth', insert: 'auth', update: 'auth', upsert: 'auth', delete: 'admin' },
  sales: { select: 'auth', insert: 'server', update: 'admin', upsert: 'admin', delete: 'server' },
  sale_items: { select: 'auth', insert: 'server', update: 'admin', upsert: 'admin', delete: 'server' },
  cash_closures: { select: 'auth', insert: 'auth', update: 'admin', upsert: 'admin', delete: 'server' },
  expenses: { select: 'admin', insert: 'admin', update: 'admin', upsert: 'admin', delete: 'admin' },
  recurring_expenses: { select: 'admin', insert: 'admin', update: 'admin', upsert: 'admin', delete: 'admin' },
  payment_methods: { select: 'auth', insert: 'admin', update: 'admin', upsert: 'admin', delete: 'admin' },
  audit_log: { select: 'admin', insert: 'server', update: 'server', upsert: 'server', delete: 'server' },
  ally_point_ledger: { select: 'server', insert: 'server', update: 'server', upsert: 'server', delete: 'server' },
};

const WORKER_PUBLIC_COLS = [
  'id', 'first_name', 'last_name', 'document_id', 'email', 'phone', 'role',
  'promo_code', 'ally_points', 'is_active', 'created_at',
];

const PRODUCT_SELLER_COLS = [
  'id', 'name', 'category', 'subcategory', 'flavor', 'sku', 'barcode', 'image_url',
  'sale_price', 'wholesale_price', 'min_wholesale_qty', 'stock_quantity',
  'ally_points_per_unit', 'is_active', 'created_at',
];

const PROMO_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generatePromoCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += PROMO_CODE_ALPHABET[crypto.randomInt(0, PROMO_CODE_ALPHABET.length)];
  }
  return code;
}

async function allocateUniquePromoCode(client, maxAttempts = 12) {
  for (let i = 0; i < maxAttempts; i++) {
    const code = generatePromoCode(6);
    const { rows } = await client.query(
      'SELECT 1 FROM worker_profiles WHERE promo_code = $1 LIMIT 1',
      [code]
    );
    if (!rows[0]) return code;
  }
  throw httpError(500, 'No se pudo generar un código promocional único');
}

function requireAlly(req, res, next) {
  if (req.user?.role !== 'ally') {
    return res.status(403).json({ error: 'Requiere rol aliado' });
  }
  next();
}

function sanitizeSelectList(select) {
  if (!select || select === '*') return '*';
  const cols = String(select).split(',').map((s) => s.trim()).filter(Boolean);
  if (!cols.length || !cols.every((c) => IDENT_RE.test(c))) {
    throw httpError(400, 'Lista de columnas inválida');
  }
  return cols.map((c) => `"${c}"`).join(', ');
}

function resolveSelect(table, rule, role, select) {
  const hidden = new Set(rule.hiddenCols || []);
  if (role !== 'admin') (rule.sellerHiddenCols || []).forEach((c) => hidden.add(c));

  if (hidden.size === 0) return sanitizeSelectList(select);

  const base =
    table === 'worker_profiles' ? WORKER_PUBLIC_COLS :
    table === 'products' && role !== 'admin' ? PRODUCT_SELLER_COLS :
    null;

  if (!select || select === '*') {
    if (!base) return '*';
    return base.filter((c) => !hidden.has(c)).map((c) => `"${c}"`).join(', ');
  }
  const cols = String(select).split(',').map((s) => s.trim()).filter(Boolean);
  if (!cols.every((c) => IDENT_RE.test(c))) throw httpError(400, 'Lista de columnas inválida');
  const requested = cols.filter((c) => !hidden.has(c));
  if (requested.length === 0) throw httpError(400, 'Sin columnas permitidas en la selección');
  return requested.map((c) => `"${c}"`).join(', ');
}

function checkAccess(rule, action, role) {
  const level = rule[action];
  if (!level || level === 'server') {
    throw httpError(403, 'Operación no permitida por este canal; usa el endpoint dedicado');
  }
  if (level === 'admin' && role !== 'admin') {
    throw httpError(403, 'Requiere rol administrador');
  }
}

async function audit(client, actor, action, entity, entityId, detail = {}) {
  await client.query(
    `INSERT INTO audit_log (actor_id, actor_email, action, entity, entity_id, detail)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [actor?.id || null, actor?.email || null, action, entity, entityId || null, JSON.stringify(detail)]
  );
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) return res.status(401).json({ error: 'No autenticado' });

    const { rows } = await pool.query(
      `SELECT s.expires_at, w.id, w.email, w.role, w.is_active
       FROM public.sessions s
       JOIN public.worker_profiles w ON w.id = s.user_id
       WHERE s.token = $1
       LIMIT 1`,
      [token]
    );
    const sess = rows[0];
    if (!sess || new Date(sess.expires_at) <= new Date()) {
      return res.status(401).json({ error: 'Sesión expirada o inválida' });
    }
    if (sess.is_active === false) {
      return res.status(403).json({ error: 'Cuenta inhabilitada' });
    }
    req.authToken = token;
    req.user = { id: sess.id, email: sess.email, role: sess.role };
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Requiere rol administrador' });
  }
  next();
}

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, mode: 'local' });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/** Proxy BCV para el POS cuando el navegador no puede llamar a dolarapi directamente. */
app.get('/public/bcv/oficial', async (_req, res) => {
  const today = new Date().toISOString().split('T')[0];
  try {
    const upstream = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
    const json = await upstream.json();
    const raw = json?.promedio ?? json?.venta ?? json?.compra;
    const rate = Number(raw);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('invalid rate');
    const date = json?.fechaActualizacion
      ? String(json.fechaActualizacion).split('T')[0]
      : today;
    res.json({ rate, date, source: 'dolarapi' });
  } catch (e) {
    console.warn('[bcv] fallback:', e?.message || e);
    res.json({ rate: 36.5, date: today, source: 'fallback' });
  }
});

app.post('/auth/login', loginLimiter, async (req, res) => {
  try {
    const identifier = String(req.body?.identifier || '').trim();
    const password = String(req.body?.password || '');
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Faltan credenciales' });
    }

    const email = identifier.includes('@')
      ? identifier.toLowerCase()
      : `${identifier}@caloricofit.com`;

    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, document_id, email, phone, role, is_active, password
       FROM worker_profiles
       WHERE lower(email) = lower($1) OR document_id = $2
       LIMIT 1`,
      [email, identifier]
    );

    const user = rows[0];
    if (!user || !user.password) {
      return res.status(401).json({ error: 'Invalid login credentials' });
    }

    // Hash bcrypt (pgcrypto) o password legado en texto plano (se migra al vuelo)
    const { rows: check } = await pool.query(
      'SELECT (crypt($1, $2) = $2) AS ok',
      [password, user.password]
    );
    let ok = check[0]?.ok === true;
    if (!ok && !String(user.password).startsWith('$2') && user.password === password) {
      await pool.query(
        "UPDATE worker_profiles SET password = crypt($1, gen_salt('bf')) WHERE id = $2",
        [password, user.id]
      );
      ok = true;
    }
    if (!ok) {
      return res.status(401).json({ error: 'Invalid login credentials' });
    }
    if (user.is_active === false) {
      return res.status(403).json({ error: 'Cuenta inhabilitada' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    await pool.query('DELETE FROM public.sessions WHERE expires_at <= now()');
    await pool.query(
      "INSERT INTO public.sessions (token, user_id, expires_at) VALUES ($1, $2, now() + interval '30 days')",
      [token, user.id]
    );

    const { password: _pw, ...profile } = user;
    res.json({
      session: {
        access_token: token,
        token_type: 'bearer',
        user: {
          id: profile.id,
          email: profile.email,
          user_metadata: {
            first_name: profile.first_name,
            last_name: profile.last_name,
            role: profile.role,
            document_id: profile.document_id,
          },
        },
      },
      profile,
    });
  } catch (e) {
    console.error(e);
    const msg = String(e.message || e);
    if (msg.includes('sessions') && msg.includes('does not exist')) {
      return res.status(503).json({
        error: 'Base de datos sin migrar (tabla sessions). Contacta al administrador o reinicia la API.',
      });
    }
    res.status(500).json({ error: msg });
  }
});

app.post('/auth/logout', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM public.sessions WHERE token = $1', [req.authToken]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/auth/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${WORKER_PUBLIC_COLS.map((c) => `"${c}"`).join(', ')}
       FROM worker_profiles WHERE id = $1 LIMIT 1`,
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Perfil no encontrado' });
    res.json({ profile: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/auth/signup', requireAuth, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { email, password, first_name, last_name, document_id, phone, role } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y password son obligatorios' });
    }
    const finalRole = ['admin', 'seller', 'ally'].includes(role) ? role : 'seller';
    const idResult = await client.query('SELECT uuid_generate_v4() AS id');
    const id = idResult.rows[0].id;

    await client.query('BEGIN');

    await client.query(
      `INSERT INTO auth.users (id, email, raw_user_meta_data)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        email,
        JSON.stringify({ first_name, last_name, document_id, phone, role: finalRole }),
      ]
    );

    let promoCode = null;
    if (finalRole === 'ally') {
      promoCode = await allocateUniquePromoCode(client);
    }

    await client.query(
      `INSERT INTO worker_profiles
        (id, first_name, last_name, document_id, email, phone, role, promo_code, ally_points, is_active, password)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,crypt($10, gen_salt('bf')))`,
      [
        id,
        first_name || 'Nuevo',
        last_name || 'Usuario',
        document_id || null,
        email,
        phone || null,
        finalRole,
        promoCode,
        0,
        password,
      ]
    );

    await audit(client, req.user, 'worker.create', 'worker_profiles', id, {
      email,
      role: finalRole,
      promo_code: promoCode,
    });

    await client.query('COMMIT');

    res.json({
      user: { id, email },
      profile: {
        id,
        email,
        first_name,
        last_name,
        role: finalRole,
        promo_code: promoCode,
        ally_points: 0,
      },
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(e);
    res.status(e.httpStatus || 500).json({ error: String(e.message || e) });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// Checkout transaccional (venta + items + stock + puntos en una transacción)
// ---------------------------------------------------------------------------
const SALE_INPUT_COLS = [
  'customer_id', 'subtotal_usd', 'discount_usd', 'surcharge_usd', 'total_usd',
  'payment_method', 'currency_used', 'exchange_rate_applied',
  'points_earned', 'points_redeemed', 'is_wholesale',
];

app.post('/sales/checkout', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    if (req.user.role === 'ally') {
      return res.status(403).json({ error: 'Los aliados no pueden registrar ventas' });
    }
    const { sale, items, promo_code: bodyPromo } = req.body || {};
    if (!sale || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Venta e items son obligatorios' });
    }

    await client.query('BEGIN');

    const rawPromo = String(bodyPromo || sale.promo_code || '').trim().toUpperCase();
    let allyId = null;
    let allyPromoCode = null;
    let allyPointsEarned = 0;
    if (rawPromo) {
      const { rows: allyRows } = await client.query(
        `SELECT id, promo_code FROM worker_profiles
         WHERE role = 'ally' AND is_active = true AND UPPER(promo_code) = $1
         LIMIT 1`,
        [rawPromo]
      );
      if (!allyRows[0]) throw httpError(400, 'Código de aliado inválido o inactivo');
      allyId = allyRows[0].id;
      allyPromoCode = allyRows[0].promo_code;
    }

    let totalCost = 0;
    const preparedItems = [];
    for (const item of items) {
      if (!item?.product_id || !(Number(item.quantity) > 0)) {
        throw httpError(400, 'Item inválido: product_id y quantity son obligatorios');
      }
      const { rows } = await client.query(
        `SELECT name, stock_quantity, cost_price, COALESCE(ally_points_per_unit, 0) AS ally_points_per_unit
         FROM products WHERE id = $1 FOR UPDATE`,
        [item.product_id]
      );
      const product = rows[0];
      if (!product) throw httpError(400, `Producto no encontrado: ${item.product_id}`);
      if (Number(product.stock_quantity) < Number(item.quantity)) {
        throw httpError(409, `Stock insuficiente para "${product.name}" (disponible: ${product.stock_quantity})`);
      }
      await client.query(
        'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
        [item.quantity, item.product_id]
      );
      const qty = Number(item.quantity);
      const unitCost = Number(product.cost_price || 0);
      totalCost += unitCost * qty;
      if (allyId) {
        allyPointsEarned += qty * Number(product.ally_points_per_unit || 0);
      }
      preparedItems.push({
        product_id: item.product_id,
        quantity: qty,
        unit_price_usd: Number(item.unit_price_usd || 0),
        unit_cost_usd: unitCost,
        subtotal_usd: Number(item.subtotal_usd || 0),
      });
    }

    const cols = SALE_INPUT_COLS.filter((c) => sale[c] !== undefined);
    const vals = cols.map((c) => sale[c]);
    const extraCols = ['seller_id', 'cost_usd', 'status', 'ally_id', 'ally_promo_code', 'ally_points_earned'];
    const extraVals = [req.user.id, totalCost, 'COMPLETED', allyId, allyPromoCode, allyPointsEarned];
    const allCols = [...cols, ...extraCols];
    const allVals = [...vals, ...extraVals];
    const saleSql = `INSERT INTO sales (${allCols.map((c) => `"${c}"`).join(', ')})
                     VALUES (${allCols.map((_, i) => `$${i + 1}`).join(', ')})
                     RETURNING *`;
    const { rows: saleRows } = await client.query(saleSql, allVals);
    const saleRow = saleRows[0];

    for (const item of preparedItems) {
      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price_usd, unit_cost_usd, subtotal_usd)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [saleRow.id, item.product_id, item.quantity, item.unit_price_usd, item.unit_cost_usd, item.subtotal_usd]
      );
    }

    const pointsEarned = Number(sale.points_earned || 0);
    const pointsRedeemed = Number(sale.points_redeemed || 0);
    if (sale.customer_id && (pointsEarned || pointsRedeemed)) {
      await client.query(
        'UPDATE customers SET loyalty_points = GREATEST(0, COALESCE(loyalty_points, 0) - $1 + $2) WHERE id = $3',
        [pointsRedeemed, pointsEarned, sale.customer_id]
      );
    }

    if (allyId && allyPointsEarned > 0) {
      await client.query(
        'UPDATE worker_profiles SET ally_points = COALESCE(ally_points, 0) + $1 WHERE id = $2',
        [allyPointsEarned, allyId]
      );
      await client.query(
        `INSERT INTO ally_point_ledger
          (ally_id, kind, points, sale_id, notes, status, created_by)
         VALUES ($1, 'earn', $2, $3, $4, 'posted', $5)`,
        [allyId, allyPointsEarned, saleRow.id, `Venta ${allyPromoCode}`, req.user.id]
      );
    }

    await audit(client, req.user, 'sale.checkout', 'sales', saleRow.id, {
      total_usd: saleRow.total_usd,
      items: preparedItems.length,
      payment_method: saleRow.payment_method,
      ally_id: allyId,
      ally_points_earned: allyPointsEarned,
    });

    await client.query('COMMIT');
    res.json({ data: saleRow, error: null });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(e);
    res.status(e.httpStatus || 500).json({ data: null, error: { message: String(e.message || e) } });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// Anulación transaccional (restaura stock y revierte puntos, idempotente)
// ---------------------------------------------------------------------------
app.post('/sales/:id/void', requireAuth, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const saleId = req.params.id;
    await client.query('BEGIN');

    const { rows } = await client.query('SELECT * FROM sales WHERE id = $1 FOR UPDATE', [saleId]);
    const sale = rows[0];
    if (!sale) throw httpError(404, 'Venta no encontrada');
    if (sale.status === 'VOIDED') throw httpError(409, 'La venta ya está anulada');

    const { rows: items } = await client.query(
      'SELECT product_id, quantity FROM sale_items WHERE sale_id = $1',
      [saleId]
    );
    for (const item of items) {
      if (!item.product_id) continue;
      await client.query(
        'UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2',
        [item.quantity, item.product_id]
      );
    }

    if (sale.customer_id) {
      await client.query(
        'UPDATE customers SET loyalty_points = GREATEST(0, COALESCE(loyalty_points, 0) - $1 + $2) WHERE id = $3',
        [Number(sale.points_earned || 0), Number(sale.points_redeemed || 0), sale.customer_id]
      );
    }

    const allyPts = Number(sale.ally_points_earned || 0);
    if (sale.ally_id && allyPts > 0) {
      await client.query(
        'UPDATE worker_profiles SET ally_points = GREATEST(0, COALESCE(ally_points, 0) - $1) WHERE id = $2',
        [allyPts, sale.ally_id]
      );
      await client.query(
        `INSERT INTO ally_point_ledger
          (ally_id, kind, points, sale_id, notes, status, created_by)
         VALUES ($1, 'void_reversal', $2, $3, $4, 'posted', $5)`,
        [sale.ally_id, -allyPts, saleId, 'Anulación de venta', req.user.id]
      );
    }

    await client.query("UPDATE sales SET status = 'VOIDED' WHERE id = $1", [saleId]);
    await audit(client, req.user, 'sale.void', 'sales', saleId, {
      total_usd: sale.total_usd,
      items_restored: items.length,
      ally_points_reversed: allyPts || 0,
    });

    await client.query('COMMIT');
    res.json({ data: { id: saleId, status: 'VOIDED' }, error: null });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(e);
    res.status(e.httpStatus || 500).json({ data: null, error: { message: String(e.message || e) } });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// Reposición de stock (atómico: suma/resta sin pisar ventas concurrentes)
// ---------------------------------------------------------------------------
app.post('/products/:id/add-stock', requireAuth, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const productId = req.params.id;
    const qty = Math.trunc(Number(req.body?.quantity));
    if (!Number.isFinite(qty) || qty === 0) {
      throw httpError(400, 'Indica una cantidad distinta de cero');
    }

    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE products
       SET stock_quantity = stock_quantity + $1
       WHERE id = $2 AND COALESCE(is_active, true) = true
         AND stock_quantity + $1 >= 0
       RETURNING id, name, flavor, cost_price, stock_quantity`,
      [qty, productId]
    );
    const product = rows[0];
    if (!product) {
      throw httpError(409, 'No se pudo ajustar el stock (producto inactivo o quedaría negativo)');
    }

    if (qty > 0) {
      const label = product.flavor ? `${product.name} (${product.flavor})` : product.name;
      await client.query(
        `INSERT INTO expenses (description, amount_usd, category)
         VALUES ($1, $2, 'inventory_purchase')`,
        [`Reposición: ${label}`, Number(product.cost_price || 0) * qty]
      );
    }

    await client.query('COMMIT');
    res.json({ data: product, error: null });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(e);
    res.status(e.httpStatus || 500).json({ data: null, error: { message: String(e.message || e) } });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// Alianzas: lookup de código, panel admin y panel aliado
// ---------------------------------------------------------------------------
app.get('/promo/lookup', requireAuth, async (req, res) => {
  try {
    if (req.user.role === 'ally') {
      return res.status(403).json({ error: 'No permitido' });
    }
    const code = String(req.query.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'Código requerido' });
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, promo_code
       FROM worker_profiles
       WHERE role = 'ally' AND is_active = true AND UPPER(promo_code) = $1
       LIMIT 1`,
      [code]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Código no encontrado' });
    res.json({ data: rows[0], error: null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/allies', requireAuth, requireAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const params = [];
    let where = `WHERE role = 'ally'`;
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (
        first_name ILIKE $1 OR last_name ILIKE $1 OR document_id ILIKE $1
        OR email ILIKE $1 OR promo_code ILIKE $1
      )`;
    }
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, document_id, email, phone, promo_code,
              ally_points, is_active, created_at
       FROM worker_profiles
       ${where}
       ORDER BY created_at DESC`,
      params
    );
    res.json({ data: rows, error: null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ data: null, error: { message: String(e.message || e) } });
  }
});

function normalizePromoCode(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

app.patch('/allies/:id', requireAuth, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const allyId = req.params.id;
    const { first_name, last_name, promo_code, phone, document_id } = req.body || {};

    await client.query('BEGIN');
    const { rows: allyRows } = await client.query(
      `SELECT id, promo_code FROM worker_profiles WHERE id = $1 AND role = 'ally' FOR UPDATE`,
      [allyId]
    );
    if (!allyRows[0]) throw httpError(404, 'Aliado no encontrado');

    const updates = [];
    const vals = [];
    let i = 1;

    if (first_name !== undefined) {
      const fn = String(first_name || '').trim();
      if (!fn) throw httpError(400, 'Nombre obligatorio');
      updates.push(`first_name = $${i++}`);
      vals.push(fn);
    }
    if (last_name !== undefined) {
      const ln = String(last_name || '').trim();
      if (!ln) throw httpError(400, 'Apellido obligatorio');
      updates.push(`last_name = $${i++}`);
      vals.push(ln);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${i++}`);
      vals.push(phone ? String(phone).trim() : null);
    }
    if (document_id !== undefined) {
      updates.push(`document_id = $${i++}`);
      vals.push(document_id ? String(document_id).trim() : null);
    }
    if (promo_code !== undefined) {
      const code = normalizePromoCode(promo_code);
      if (code.length < 4 || code.length > 12) {
        throw httpError(400, 'El código debe tener entre 4 y 12 caracteres (letras/números)');
      }
      const { rows: clash } = await client.query(
        `SELECT id FROM worker_profiles
         WHERE UPPER(promo_code) = $1 AND id <> $2
         LIMIT 1`,
        [code, allyId]
      );
      if (clash[0]) throw httpError(409, 'Ese código ya está en uso por otro aliado');
      updates.push(`promo_code = $${i++}`);
      vals.push(code);
    }

    if (!updates.length) throw httpError(400, 'Nada que actualizar');

    vals.push(allyId);
    const { rows } = await client.query(
      `UPDATE worker_profiles SET ${updates.join(', ')}
       WHERE id = $${i} AND role = 'ally'
       RETURNING id, first_name, last_name, document_id, email, phone, promo_code, ally_points, is_active, created_at`,
      vals
    );

    await audit(client, req.user, 'ally.update', 'worker_profiles', allyId, {
      fields: Object.keys(req.body || {}),
      promo_code: rows[0]?.promo_code,
    });
    await client.query('COMMIT');
    res.json({ data: rows[0], error: null });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(e);
    res.status(e.httpStatus || 500).json({ data: null, error: { message: String(e.message || e) } });
  } finally {
    client.release();
  }
});

app.delete('/allies/:id', requireAuth, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const allyId = req.params.id;
    await client.query('BEGIN');
    const { rows: allyRows } = await client.query(
      `SELECT id, first_name, last_name, promo_code, email
       FROM worker_profiles WHERE id = $1 AND role = 'ally' FOR UPDATE`,
      [allyId]
    );
    if (!allyRows[0]) throw httpError(404, 'Aliado no encontrado');

    // Conservar historial de ventas: solo desvincular atribución
    await client.query('UPDATE sales SET ally_id = NULL WHERE ally_id = $1', [allyId]);
    await client.query('DELETE FROM sessions WHERE user_id = $1', [allyId]);
    await client.query('DELETE FROM worker_profiles WHERE id = $1 AND role = $2', [allyId, 'ally']);
    await client.query('DELETE FROM auth.users WHERE id = $1', [allyId]);

    await audit(client, req.user, 'ally.delete', 'worker_profiles', allyId, {
      promo_code: allyRows[0].promo_code,
      email: allyRows[0].email,
      name: `${allyRows[0].first_name} ${allyRows[0].last_name}`,
    });
    await client.query('COMMIT');
    res.json({ data: { id: allyId, deleted: true }, error: null });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(e);
    res.status(e.httpStatus || 500).json({ data: null, error: { message: String(e.message || e) } });
  } finally {
    client.release();
  }
});

app.get('/allies/redeem-requests', requireAuth, requireAdmin, async (req, res) => {
  try {
    const status = String(req.query.status || 'pending');
    const { rows } = await pool.query(
      `SELECT l.*, w.first_name, w.last_name, w.promo_code, w.ally_points AS ally_balance
       FROM ally_point_ledger l
       JOIN worker_profiles w ON w.id = l.ally_id
       WHERE l.kind = 'redeem_request' AND l.status = $1
       ORDER BY l.created_at ASC`,
      [status]
    );
    res.json({ data: rows, error: null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ data: null, error: { message: String(e.message || e) } });
  }
});

app.get('/allies/:id/ledger', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, ally_id, kind, points, sale_id, notes, status,
              created_by, resolved_by, resolved_at, created_at
       FROM ally_point_ledger
       WHERE ally_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.params.id]
    );
    res.json({ data: rows, error: null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ data: null, error: { message: String(e.message || e) } });
  }
});

app.post('/allies/:id/redeems', requireAuth, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const allyId = req.params.id;
    const { action, points, notes, request_id } = req.body || {};
    await client.query('BEGIN');

    const { rows: allyRows } = await client.query(
      `SELECT id, ally_points, first_name, last_name FROM worker_profiles
       WHERE id = $1 AND role = 'ally' FOR UPDATE`,
      [allyId]
    );
    const ally = allyRows[0];
    if (!ally) throw httpError(404, 'Aliado no encontrado');

    if (action === 'approve' || action === 'reject') {
      if (!request_id) throw httpError(400, 'request_id es obligatorio');
      const { rows: reqRows } = await client.query(
        `SELECT * FROM ally_point_ledger
         WHERE id = $1 AND ally_id = $2 AND kind = 'redeem_request' FOR UPDATE`,
        [request_id, allyId]
      );
      const request = reqRows[0];
      if (!request) throw httpError(404, 'Solicitud no encontrada');
      if (request.status !== 'pending') throw httpError(409, 'La solicitud ya fue resuelta');

      if (action === 'reject') {
        await client.query(
          `UPDATE ally_point_ledger
           SET status = 'rejected', resolved_by = $1, resolved_at = now(), notes = COALESCE($2, notes)
           WHERE id = $3`,
          [req.user.id, notes || null, request_id]
        );
        await audit(client, req.user, 'ally.redeem.reject', 'ally_point_ledger', request_id, { ally_id: allyId });
        await client.query('COMMIT');
        return res.json({ data: { status: 'rejected' }, error: null });
      }

      const redeemPts = Number(request.points);
      if (!(redeemPts > 0)) throw httpError(400, 'Puntos de solicitud inválidos');
      if (Number(ally.ally_points) < redeemPts) {
        throw httpError(409, 'Saldo insuficiente para aprobar el canje');
      }
      await client.query(
        'UPDATE worker_profiles SET ally_points = ally_points - $1 WHERE id = $2',
        [redeemPts, allyId]
      );
      await client.query(
        `UPDATE ally_point_ledger
         SET status = 'posted', resolved_by = $1, resolved_at = now(), notes = COALESCE($2, notes)
         WHERE id = $3`,
        [req.user.id, notes || request.notes, request_id]
      );
      const { rows: redeemRows } = await client.query(
        `INSERT INTO ally_point_ledger
          (ally_id, kind, points, notes, status, created_by, resolved_by, resolved_at)
         VALUES ($1, 'redeem', $2, $3, 'posted', $4, $4, now())
         RETURNING *`,
        [allyId, -redeemPts, notes || request.notes || 'Canje aprobado', req.user.id]
      );
      await audit(client, req.user, 'ally.redeem.approve', 'ally_point_ledger', redeemRows[0].id, {
        ally_id: allyId,
        points: redeemPts,
      });
      await client.query('COMMIT');
      return res.json({ data: redeemRows[0], error: null });
    }

    // Canje directo por admin
    const redeemPts = Number(points);
    if (!(redeemPts > 0)) throw httpError(400, 'points debe ser > 0');
    if (Number(ally.ally_points) < redeemPts) {
      throw httpError(409, 'Saldo insuficiente');
    }
    await client.query(
      'UPDATE worker_profiles SET ally_points = ally_points - $1 WHERE id = $2',
      [redeemPts, allyId]
    );
    const { rows: redeemRows } = await client.query(
      `INSERT INTO ally_point_ledger
        (ally_id, kind, points, notes, status, created_by, resolved_by, resolved_at)
       VALUES ($1, 'redeem', $2, $3, 'posted', $4, $4, now())
       RETURNING *`,
      [allyId, -redeemPts, notes || 'Canje registrado por admin', req.user.id]
    );
    await audit(client, req.user, 'ally.redeem.direct', 'ally_point_ledger', redeemRows[0].id, {
      ally_id: allyId,
      points: redeemPts,
    });
    await client.query('COMMIT');
    res.json({ data: redeemRows[0], error: null });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(e);
    res.status(e.httpStatus || 500).json({ data: null, error: { message: String(e.message || e) } });
  } finally {
    client.release();
  }
});

app.get('/ally/me', requireAuth, requireAlly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, document_id, email, phone, promo_code, ally_points, is_active, created_at
       FROM worker_profiles WHERE id = $1`,
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Perfil no encontrado' });
    res.json({ data: rows[0], error: null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ data: null, error: { message: String(e.message || e) } });
  }
});

app.get('/ally/stats', requireAuth, requireAlly, async (req, res) => {
  try {
    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;
    const params = [req.user.id];
    let dateFilter = '';
    if (from) {
      params.push(from);
      dateFilter += ` AND created_at >= $${params.length}::timestamptz`;
    }
    if (to) {
      params.push(to);
      dateFilter += ` AND created_at < $${params.length}::timestamptz`;
    }
    const { rows } = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN kind = 'earn' AND status = 'posted' THEN points ELSE 0 END), 0)::int AS earned,
         COALESCE(SUM(CASE WHEN kind = 'redeem' AND status = 'posted' THEN ABS(points) ELSE 0 END), 0)::int AS redeemed,
         COALESCE(SUM(CASE WHEN kind = 'void_reversal' AND status = 'posted' THEN points ELSE 0 END), 0)::int AS reversed
       FROM ally_point_ledger
       WHERE ally_id = $1 ${dateFilter}`,
      params
    );
    const earned = Number(rows[0]?.earned || 0);
    const redeemed = Number(rows[0]?.redeemed || 0);
    const reversed = Number(rows[0]?.reversed || 0);
    res.json({
      data: {
        earned,
        redeemed,
        reversed,
        net: earned + reversed - redeemed,
        from,
        to,
      },
      error: null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ data: null, error: { message: String(e.message || e) } });
  }
});

app.get('/ally/ledger', requireAuth, requireAlly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, kind, points, sale_id, notes, status, resolved_at, created_at
       FROM ally_point_ledger
       WHERE ally_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.user.id]
    );
    res.json({ data: rows, error: null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ data: null, error: { message: String(e.message || e) } });
  }
});

app.post('/ally/redeem-requests', requireAuth, requireAlly, async (req, res) => {
  const client = await pool.connect();
  try {
    const points = Number(req.body?.points);
    const notes = String(req.body?.notes || '').trim() || null;
    if (!(points > 0) || !Number.isInteger(points)) {
      return res.status(400).json({ error: 'points debe ser un entero > 0' });
    }
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT ally_points FROM worker_profiles WHERE id = $1 AND role = $2 FOR UPDATE',
      [req.user.id, 'ally']
    );
    if (!rows[0]) throw httpError(404, 'Perfil no encontrado');
    if (Number(rows[0].ally_points) < points) {
      throw httpError(409, 'Saldo insuficiente');
    }
    const { rows: pending } = await client.query(
      `SELECT COALESCE(SUM(points), 0)::int AS pending_pts
       FROM ally_point_ledger
       WHERE ally_id = $1 AND kind = 'redeem_request' AND status = 'pending'`,
      [req.user.id]
    );
    const pendingPts = Number(pending[0]?.pending_pts || 0);
    if (Number(rows[0].ally_points) - pendingPts < points) {
      throw httpError(409, 'Ya tienes solicitudes pendientes que cubren tu saldo');
    }
    const { rows: inserted } = await client.query(
      `INSERT INTO ally_point_ledger
        (ally_id, kind, points, notes, status, created_by)
       VALUES ($1, 'redeem_request', $2, $3, 'pending', $1)
       RETURNING *`,
      [req.user.id, points, notes]
    );
    await audit(client, req.user, 'ally.redeem.request', 'ally_point_ledger', inserted[0].id, {
      points,
    });
    await client.query('COMMIT');
    res.json({ data: inserted[0], error: null });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(e);
    res.status(e.httpStatus || 500).json({ data: null, error: { message: String(e.message || e) } });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// Purgado masivo auditado (solo admin). No restaura stock: el flujo correcto
// para ventas individuales es /sales/:id/void.
// ---------------------------------------------------------------------------
app.post('/admin/purge', requireAuth, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { entity, since } = req.body || {};
    if (!['sales', 'cash_closures'].includes(entity)) {
      return res.status(400).json({ error: 'Entidad inválida (sales | cash_closures)' });
    }

    await client.query('BEGIN');
    const params = [];
    let cond = '';
    if (since) {
      cond = 'WHERE created_at >= $1';
      params.push(since);
    }
    const { rows: countRows } = await client.query(
      `SELECT count(*)::int AS n FROM "${entity}" ${cond}`,
      params
    );
    const count = countRows[0].n;

    await audit(client, req.user, 'admin.purge', entity, null, {
      since: since || null,
      rows_deleted: count,
    });

    const { rows: deleted } = await client.query(
      `DELETE FROM "${entity}" ${cond} RETURNING id`,
      params
    );

    await client.query('COMMIT');
    res.json({ data: { deleted: deleted.length }, error: null });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(e);
    res.status(e.httpStatus || 500).json({ data: null, error: { message: String(e.message || e) } });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// CRUD genérico con autorización por rol
// ---------------------------------------------------------------------------
// Los clientes envían objetos/arrays JSON (p.ej. cash_closures.sales_data, jsonb).
// node-pg serializa un array JS como literal de array de Postgres ({...}), que
// rompe las columnas jsonb ("invalid input syntax for type json"). Se envía el
// JSON ya stringificado y Postgres lo castea a jsonb. Ninguna tabla expuesta
// tiene columnas de array nativo, así que es seguro para insert/update/upsert.
function toPgValue(v) {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v) || (typeof v === 'object' && !Buffer.isBuffer(v))) {
    return JSON.stringify(v);
  }
  return v;
}

function buildWhere(filters = [], startIdx = 1) {
  const clauses = [];
  const values = [];
  let i = startIdx;
  for (const f of filters) {
    if (!IDENT_RE.test(f.col || '') && f.op !== 'or') continue;
    if (f.op === 'eq') {
      clauses.push(`"${f.col}" = $${i++}`);
      values.push(f.val);
    } else if (f.op === 'neq') {
      clauses.push(`"${f.col}" <> $${i++}`);
      values.push(f.val);
    } else if (f.op === 'in') {
      clauses.push(`"${f.col}" = ANY($${i++})`);
      values.push(f.val);
    } else if (f.op === 'gt') {
      clauses.push(`"${f.col}" > $${i++}`);
      values.push(f.val);
    } else if (f.op === 'gte') {
      clauses.push(`"${f.col}" >= $${i++}`);
      values.push(f.val);
    } else if (f.op === 'lt') {
      clauses.push(`"${f.col}" < $${i++}`);
      values.push(f.val);
    } else if (f.op === 'lte') {
      clauses.push(`"${f.col}" <= $${i++}`);
      values.push(f.val);
    } else if (f.op === 'ilike') {
      clauses.push(`"${f.col}" ILIKE $${i++}`);
      values.push(f.val);
    } else if (f.op === 'or') {
      const parts = String(f.val || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const orClauses = [];
      for (const part of parts) {
        const m = part.match(/^([a-z0-9_]+)\.([a-z]+)\.(.+)$/i);
        if (!m) continue;
        const col = m[1];
        const op = m[2].toLowerCase();
        const val = m[3];
        if (!IDENT_RE.test(col)) continue;
        if (op === 'ilike') {
          orClauses.push(`"${col}" ILIKE $${i++}`);
          values.push(val);
        } else if (op === 'eq') {
          orClauses.push(`"${col}" = $${i++}`);
          values.push(val);
        }
      }
      if (orClauses.length) clauses.push(`(${orClauses.join(' OR ')})`);
    }
  }
  return {
    sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '',
    values,
    nextIdx: i,
  };
}

app.post('/db', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      table,
      action = 'select',
      select = '*',
      data,
      order,
      limit,
      single,
      maybeSingle,
    } = req.body || {};
    let { filters = [] } = req.body || {};

    if (!table || !IDENT_RE.test(table)) {
      return res.status(400).json({ error: 'Tabla inválida' });
    }
    const rule = TABLE_RULES[table];
    if (!rule) {
      return res.status(403).json({ error: 'Tabla no permitida' });
    }

    // Aliados: solo lectura de su propio perfil vía /db; el resto usa endpoints /ally/*
    if (req.user.role === 'ally') {
      if (table !== 'worker_profiles' || action !== 'select') {
        return res.status(403).json({ error: 'Acceso restringido para aliados' });
      }
    }

    checkAccess(rule, action, req.user.role);

    // Sellers/aliados solo pueden verse a sí mismos en worker_profiles
    if (table === 'worker_profiles' && req.user.role !== 'admin') {
      filters = [...filters, { op: 'eq', col: 'id', val: req.user.id }];
    }

    if (order?.column && !IDENT_RE.test(order.column)) {
      return res.status(400).json({ error: 'Columna de orden inválida' });
    }

    if (action === 'select') {
      const selectSql = resolveSelect(table, rule, req.user.role, select);
      const { sql, values } = buildWhere(filters);
      let q = `SELECT ${selectSql} FROM "${table}"${sql}`;
      if (order?.column) {
        q += ` ORDER BY "${order.column}" ${order.ascending === false ? 'DESC' : 'ASC'}`;
      }
      if (limit) q += ` LIMIT ${Number(limit)}`;
      if (single || maybeSingle) q += ' LIMIT 1';
      const { rows } = await client.query(q, values);
      if (single && rows.length === 0) {
        return res.json({ data: null, error: { code: 'PGRST116', message: 'No rows' } });
      }
      return res.json({
        data: single || maybeSingle ? rows[0] || null : rows,
        error: null,
      });
    }

    const hidden = new Set(rule.hiddenCols || []);

    if (action === 'insert') {
      const rowsIn = Array.isArray(data) ? data : [data];
      const inserted = [];
      for (const row of rowsIn) {
        const cols = Object.keys(row).filter((c) => IDENT_RE.test(c));
        const vals = cols.map((c) => toPgValue(row[c]));
        const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
        const returning = hidden.size
          ? cols.filter((c) => !hidden.has(c)).concat(['id']).filter((c, i, a) => a.indexOf(c) === i)
          : null;
        const q = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')})
                   VALUES (${placeholders}) RETURNING ${returning ? returning.map((c) => `"${c}"`).join(', ') : '*'}`;
        const { rows } = await client.query(q, vals);
        inserted.push(rows[0]);
      }
      if (table === 'worker_profiles') await hashPlaintextPasswords(client);
      return res.json({
        data: single || (!Array.isArray(data) && rowsIn.length === 1) ? inserted[0] : inserted,
        error: null,
      });
    }

    if (action === 'update') {
      const { sql, values, nextIdx } = buildWhere(filters);
      const cols = Object.keys(data || {}).filter((c) => IDENT_RE.test(c));
      const sets = cols.map((c, idx) => `"${c}" = $${nextIdx + idx}`);
      const returning = hidden.size
        ? WORKER_PUBLIC_COLS.map((c) => `"${c}"`).join(', ')
        : '*';
      const q = `UPDATE "${table}" SET ${sets.join(', ')}${sql} RETURNING ${returning}`;
      const { rows } = await client.query(q, [...values, ...cols.map((c) => toPgValue(data[c]))]);
      if (table === 'worker_profiles') await hashPlaintextPasswords(client);
      return res.json({ data: single ? rows[0] || null : rows, error: null });
    }

    if (action === 'upsert') {
      const rowsIn = Array.isArray(data) ? data : [data];
      const upserted = [];
      for (const row of rowsIn) {
        const cols = Object.keys(row).filter((c) => IDENT_RE.test(c));
        const vals = cols.map((c) => toPgValue(row[c]));
        const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
        const updates = cols
          .filter((c) => c !== 'id')
          .map((c) => `"${c}" = EXCLUDED."${c}"`)
          .join(', ');
        const conflict = cols.includes('id') ? 'id' : cols[0];
        const returning = hidden.size
          ? WORKER_PUBLIC_COLS.map((c) => `"${c}"`).join(', ')
          : '*';
        const q = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')})
                   VALUES (${placeholders})
                   ON CONFLICT ("${conflict}") DO UPDATE SET ${updates || `"${conflict}" = EXCLUDED."${conflict}"`}
                   RETURNING ${returning}`;
        const { rows } = await client.query(q, vals);
        upserted.push(rows[0]);
      }
      if (table === 'worker_profiles') await hashPlaintextPasswords(client);
      return res.json({
        data: Array.isArray(data) ? upserted : upserted[0],
        error: null,
      });
    }

    if (action === 'delete') {
      const { sql, values } = buildWhere(filters);
      const q = `DELETE FROM "${table}"${sql} RETURNING *`;
      const { rows } = await client.query(q, values);
      return res.json({ data: rows, error: null });
    }

    return res.status(400).json({ error: `Acción no soportada: ${action}` });
  } catch (e) {
    console.error(e);
    res
      .status(e.httpStatus || 500)
      .json({ data: null, error: { message: String(e.message || e) } });
  } finally {
    client.release();
  }
});

// Migra al vuelo passwords en texto plano escritas vía /db
async function hashPlaintextPasswords(client) {
  await client.query(
    "UPDATE worker_profiles SET password = crypt(password, gen_salt('bf')) WHERE password IS NOT NULL AND password NOT LIKE '$2%'"
  );
}

/** Idempotente: evita error "relation sessions does not exist" si el deploy no corrió 04_security.sql */
async function ensureSecuritySchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.sessions (
      token TEXT PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON public.sessions (user_id);
    CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON public.sessions (expires_at);
    CREATE TABLE IF NOT EXISTS public.audit_log (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      actor_id UUID REFERENCES public.worker_profiles(id) ON DELETE SET NULL,
      actor_email TEXT,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      detail JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON public.audit_log (created_at);
    CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON public.audit_log (entity, action);
  `);
  await pool.query(
    "UPDATE public.worker_profiles SET password = crypt(password, gen_salt('bf')) WHERE password IS NOT NULL AND password NOT LIKE '$2%'"
  );
}

ensureSecuritySchema()
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log(`[local-api] http://${HOST}:${PORT} → Postgres local`);
    });
  })
  .catch((e) => {
    console.error('[local-api] No se pudo inicializar el esquema de seguridad:', e);
    process.exit(1);
  });
