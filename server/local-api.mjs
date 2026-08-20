import express from 'express';
import cors from 'cors';
import pg from 'pg';

const { Pool } = pg;
const PORT = Number(process.env.LOCAL_API_PORT || 3032);

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://calorico:calorico_smoke@localhost:15433/caloricofit',
});

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, mode: 'local' });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
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
       WHERE lower(email) = lower($1)
          OR document_id = $2
          OR lower(email) = lower($3)
       LIMIT 1`,
      [email, identifier, identifier]
    );

    const user = rows[0];
    if (!user || String(user.password || '123') !== password) {
      return res.status(401).json({ error: 'Invalid login credentials' });
    }
    if (user.is_active === false) {
      return res.status(403).json({ error: 'Cuenta inhabilitada' });
    }

    const { password: _pw, ...profile } = user;
    res.json({
      session: {
        access_token: `local-${profile.id}`,
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

app.post('/auth/signup', async (req, res) => {
  try {
    const { email, password, first_name, last_name, document_id, phone, role } = req.body || {};
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
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8)`,
      [
        id,
        first_name || 'Nuevo',
        last_name || 'Usuario',
        document_id || null,
        email,
        phone || null,
        role || 'seller',
        password || '123',
      ]
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

function buildWhere(filters = [], startIdx = 1) {
  const clauses = [];
  const values = [];
  let i = startIdx;
  for (const f of filters) {
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
    }
  }
  return {
    sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '',
    values,
    nextIdx: i,
  };
}

app.post('/db', async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      table,
      action = 'select',
      select = '*',
      filters = [],
      data,
      order,
      limit,
      single,
      maybeSingle,
    } = req.body || {};

    if (!table || !/^[a-z0-9_]+$/i.test(table)) {
      return res.status(400).json({ error: 'Tabla inválida' });
    }

    if (action === 'select') {
      const { sql, values } = buildWhere(filters);
      let q = `SELECT ${select === '*' ? '*' : select} FROM "${table}"${sql}`;
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

    if (action === 'insert') {
      const rowsIn = Array.isArray(data) ? data : [data];
      const inserted = [];
      for (const row of rowsIn) {
        const cols = Object.keys(row);
        const vals = Object.values(row);
        const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
        const q = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')})
                   VALUES (${placeholders}) RETURNING *`;
        const { rows } = await client.query(q, vals);
        inserted.push(rows[0]);
      }
      return res.json({
        data: single || (!Array.isArray(data) && rowsIn.length === 1) ? inserted[0] : inserted,
        error: null,
      });
    }

    if (action === 'update') {
      const { sql, values, nextIdx } = buildWhere(filters);
      const cols = Object.keys(data || {});
      const sets = cols.map((c, idx) => `"${c}" = $${nextIdx + idx}`);
      const q = `UPDATE "${table}" SET ${sets.join(', ')}${sql} RETURNING *`;
      const { rows } = await client.query(q, [...values, ...cols.map((c) => data[c])]);
      return res.json({ data: single ? rows[0] || null : rows, error: null });
    }

    if (action === 'upsert') {
      const rowsIn = Array.isArray(data) ? data : [data];
      const upserted = [];
      for (const row of rowsIn) {
        const cols = Object.keys(row);
        const vals = Object.values(row);
        const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
        const updates = cols
          .filter((c) => c !== 'id')
          .map((c) => `"${c}" = EXCLUDED."${c}"`)
          .join(', ');
        const conflict = cols.includes('id') ? 'id' : cols[0];
        const q = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')})
                   VALUES (${placeholders})
                   ON CONFLICT ("${conflict}") DO UPDATE SET ${updates || `"${conflict}" = EXCLUDED."${conflict}"`}
                   RETURNING *`;
        const { rows } = await client.query(q, vals);
        upserted.push(rows[0]);
      }
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
    res.status(500).json({ data: null, error: { message: String(e.message || e) } });
  } finally {
    client.release();
  }
});

app.post('/rpc/:name', async (req, res) => {
  // Smoke: RPCs no existen; el cliente hace fallback a UPDATE.
  res.json({ data: null, error: { message: `RPC ${req.params.name} no disponible en local` } });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[local-api] http://localhost:${PORT} → Postgres smoke`);
});
