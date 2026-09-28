# Calórico Fit Admin — Documentación del proyecto

> Actualizado: 2026-09 · Rama: `ender`

## Qué es

**Calórico Fit POS / Admin** — SPA de punto de venta y panel administrativo (retail fitness, Venezuela).

## Stack

| Capa | Tecnología |
|------|------------|
| UI | React 19 + TypeScript + Vite 6 + Tailwind 4 |
| API | Express (`server/local-api.mjs`), puerto 3032 |
| BD | PostgreSQL (`db/smoke/` en dev, Docker prod en VPS) |
| Cliente | `src/lib/apiClient.ts` — auth + CRUD vía `/db` y endpoints transaccionales |

## Arquitectura

```
React (POS / Admin)  →  apiClient  →  local-api.mjs  →  Postgres
```

Sin Supabase en runtime. DDL legado Supabase en `docs/archive/supabase_schema.sql` (solo referencia).

## Auth

- Login: `POST /auth/login` (cédula o email + password).
- Sesión: token en `localStorage`, `Authorization: Bearer` en requests.
- Roles en `worker_profiles`: `admin` | `seller`.

## Endpoints clave

| Método | Ruta | Uso |
|--------|------|-----|
| POST | `/auth/login` | Login |
| POST | `/db` | CRUD genérico (ventas insert bloqueado) |
| POST | `/sales/checkout` | Cobro transaccional |
| POST | `/sales/:id/void` | Anulación (admin) |
| POST | `/admin/purge` | Borrado histórico auditado |
| GET | `/public/bcv/oficial` | Tasa BCV proxy |

## Configuración

| Variable | Uso |
|----------|-----|
| `VITE_API_URL` | URL base API para el frontend |
| `DATABASE_URL` | Postgres para la API |
| `LOCAL_API_PORT` | Puerto API (default 3032) |

## Arranque local

```bash
cp .env.example .env
npm install
npm run db:up
npm run dev:local
```

Abrir http://localhost:3020 — ver `docs/LOCAL.md` y `docs/LOCAL_DB.md`.

## Seguridad

- Vendedores no reciben `cost_price` en selects de productos (API).
- Passwords bcrypt (`db/smoke/04_security.sql`).
- `audit_log` en operaciones críticas (checkout, void, purge).

## Deploy

Ver `docs/DEPLOY.md` — VPS Hostkey, pm2 `caloricofit-api`, nginx.
