# Calórico Fit POS / Admin — Contexto para el agente

> Respétalo en cada sesión.

## Qué es

POS + panel admin para tienda de suplementos/gym (retail fitness, Venezuela).
Cobro en tienda (USD, USDT, VES, Zelle, puntos, pagos mixtos), inventario, clientes,
vendedores, gastos, tasa BCV + markup VES, fidelidad, cierre de caja, métricas, export Excel.

## Stack

- React 19 + TypeScript + Vite 6 + Tailwind 4. Sin React Router (el rol decide la pantalla).
- **Backend único:** Postgres (Docker en dev / VPS en prod) + API Express `server/local-api.mjs`.
- Frontend: `src/lib/apiClient.ts` + `localClient.ts` (HTTP, sin Supabase).
- Login: cédula → email virtual `{cedula}@caloricofit.com`. Roles: `admin` → AdminDashboard, `seller` → POS.

## Comandos locales

- `npm run dev` — solo frontend, http://localhost:3020.
- `npm run db:up` + `npm run dev:local` — stack completo (API :3032).
- `npm run lint` — typecheck (`tsc --noEmit`).
- `npm run smoke:sales` — checkout + void (requiere DB + API).
- DB smoke: puerto **15433**, Adminer http://localhost:8092 (user `calorico` / pass `calorico_smoke` / db `caloricofit`).
- Login smoke: `admin@caloricofit.com` / `Calorico123*2026`; vendedor: `vendedor@caloricofit.com`.
- Migración sobre DB existente: `docker exec -i caloricofit-smoke-db psql -U calorico -d caloricofit < db/smoke/03_migrate_features.sql`

## Env

- `VITE_API_URL` — URL de la API (dev: `http://localhost:3032`, VPS: `https://dominio/api`).
- `VITE_LOCAL_API_URL` — alias aceptado por scripts de deploy legacy.

## Ventas (obligatorio)

- Cobro: `POST /sales/checkout` vía `checkoutSale()` en `src/lib/salesApi.ts`.
- Anulación admin: `POST /sales/:id/void` vía `voidSale()`.
- Purge histórico admin: `POST /admin/purge`.
- **No** insertar en `sales` / `sale_items` desde el cliente (`/db` bloquea `insert: server`).

## Git y deploy

- Desarrollo en rama `ender`; staging/main según reglas del repo.
- Commits solo cuando el usuario lo pida.
- Deploy: `docs/DEPLOY.md`, skill kleynners-deploy, path VPS `/opt/apps/caloricofit`.

## Referencias

- `docs/PLAN_EJECUCION.md` — plan por fases y avance.
- `docs/PROYECTO.md`, `docs/LOCAL.md`, `docs/LOCAL_DB.md`.

## Deuda conocida

- Monolitos `POS.tsx` / `AdminDashboard.tsx`.
- No re-ejecutar `patch_*.cjs`.
- Deps muertas: `@google/genai`.
