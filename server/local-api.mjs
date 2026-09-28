import express from 'express';
import cors from 'cors';
import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;
const PORT = Number(process.env.LOCAL_API_PORT || 3032);
const HOST = process.env.LOCAL_API_HOST || '127.0.0.1';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://calorico:calorico_smoke@localhost:15433/caloricofit',
});

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

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
};

const WORKER_PUBLIC_COLS = [
  'id', 'first_name', 'last_name', 'document_id', 'email', 'phone', 'role', 'is_active', 'created_at',
];

const PRODUCT_SELLER_COLS = [
  'id', 'name', 'category', 'subcategory', 'flavor', 'sku', 'barcode', 'image_url',
  'sale_price', 'wholesale_price', 'min_wholesale_qty', 'stock_quantity', 'is_active', 'created_at',
];

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
       FROM sessions s
       JOIN worker_profiles w ON w.id = s.user_id
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

app.post('/auth/login', async (req, res) => {
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
    await pool.query('DELETE FROM sessions WHERE expires_at <= now()');
    await pool.query(
      "INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, now() + interval '30 days')",
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
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/auth/logout', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM sessions WHERE token = $1', [req.authToken]);
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
  try {
    const { email, password, first_name, last_name, document_id, phone, role } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y password son obligatorios' });
    }
    const idResult = await pool.query('SELECT uuid_generate_v4() AS id');
    const id = idResult.rows[0].id;

    await pool.query(
      `INSERT INTO auth.users (id, email, raw_user_meta_data)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        email,
        JSON.stringify({ first_name, last_name, document_id, phone, role: role || 'seller' }),
      ]
    );

    await pool.query(
      `INSERT INTO worker_profiles
        (id, first_name, last_name, document_id, email, phone, role, is_active, password)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,crypt($8, gen_salt('bf')))`,
      [
        id,
        first_name || 'Nuevo',
        last_name || 'Usuario',
        document_id || null,
        email,
        phone || null,
        role || 'seller',
        password,
      ]
    );

    await pool.query(
      `INSERT INTO audit_log (actor_id, actor_email, action, entity, entity_id, detail)
       VALUES ($1, $2, 'worker.create', 'worker_profiles', $3, $4::jsonb)`,
      [req.user.id, req.user.email, id, JSON.stringify({ email, role: role || 'seller' })]
    );

    res.json({
      user: { id, email },
      profile: { id, email, first_name, last_name, role: role || 'seller' },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
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
    const { sale, items } = req.body || {};
    if (!sale || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Venta e items son obligatorios' });
    }

    await client.query('BEGIN');

    let totalCost = 0;
    const preparedItems = [];
    for (const item of items) {
      if (!item?.product_id || !(Number(item.quantity) > 0)) {
        throw httpError(400, 'Item inválido: product_id y quantity son obligatorios');
      }
      const { rows } = await client.query(
        'SELECT name, stock_quantity, cost_price FROM products WHERE id = $1 FOR UPDATE',
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
      const unitCost = Number(product.cost_price || 0);
      totalCost += unitCost * Number(item.quantity);
      preparedItems.push({
        product_id: item.product_id,
        quantity: Number(item.quantity),
        unit_price_usd: Number(item.unit_price_usd || 0),
        unit_cost_usd: unitCost,
        subtotal_usd: Number(item.subtotal_usd || 0),
      });
    }

    const cols = SALE_INPUT_COLS.filter((c) => sale[c] !== undefined);
    const vals = cols.map((c) => sale[c]);
    const saleSql = `INSERT INTO sales (${cols.map((c) => `"${c}"`).join(', ')}, seller_id, cost_usd, status)
                     VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}, $${cols.length + 1}, $${cols.length + 2}, 'COMPLETED')
                     RETURNING *`;
    const { rows: saleRows } = await client.query(saleSql, [...vals, req.user.id, totalCost]);
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

    await audit(client, req.user, 'sale.checkout', 'sales', saleRow.id, {
      total_usd: saleRow.total_usd,
      items: preparedItems.length,
      payment_method: saleRow.payment_method,
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

    await client.query("UPDATE sales SET status = 'VOIDED' WHERE id = $1", [saleId]);
    await audit(client, req.user, 'sale.void', 'sales', saleId, {
      total_usd: sale.total_usd,
      items_restored: items.length,
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
    checkAccess(rule, action, req.user.role);

    // Sellers solo pueden verse a sí mismos en worker_profiles
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
        const vals = cols.map((c) => row[c]);
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
      const { rows } = await client.query(q, [...values, ...cols.map((c) => data[c])]);
      if (table === 'worker_profiles') await hashPlaintextPasswords(client);
      return res.json({ data: single ? rows[0] || null : rows, error: null });
    }

    if (action === 'upsert') {
      const rowsIn = Array.isArray(data) ? data : [data];
      const upserted = [];
      for (const row of rowsIn) {
        const cols = Object.keys(row).filter((c) => IDENT_RE.test(c));
        const vals = cols.map((c) => row[c]);
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

app.listen(PORT, HOST, () => {
  console.log(`[local-api] http://${HOST}:${PORT} → Postgres local`);
});
