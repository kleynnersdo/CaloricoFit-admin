# Calórico Fit POS / Admin — Contexto para el agente

> Este archivo se carga automáticamente en cada sesión. Respétalo siempre.
> Migrado de las reglas de Cursor (`.cursor/rules/`) y la skill `kleynners-deploy`.

## Qué es

POS + panel admin para tienda de suplementos/gym (retail fitness, Venezuela).
Cobro en tienda (USD, USDT, VES, Zelle, puntos, pagos mixtos), inventario, clientes,
vendedores, gastos, tasa BCV + markup VES, fidelidad, cierre de caja, métricas, export Excel.

## Stack

- React 19 + TypeScript + Vite 6 + Tailwind 4. Sin React Router (el rol decide la pantalla).
- Dos backends:
  - **Supabase** (legado): cliente directo vía `src/lib/supabase.ts`.
  - **Modo local/VPS (actual)**: Postgres en Docker + API Express `server/local-api.mjs` (puerto 3032),
    activado con `VITE_LOCAL_MODE=true` y `VITE_LOCAL_API_URL`. Cliente: `src/lib/localClient.ts`.
- Login: cédula → email virtual `{cedula}@caloricofit.com`. Roles: `admin` → AdminDashboard, `seller` → POS.

## Comandos locales

- `npm run dev` — solo frontend, http://localhost:3020 (puertos 3000–3010 ocupados por otras apps).
- `npm run db:up` + `npm run dev:local` — stack completo con Postgres smoke (API :3032).
- `npm run lint` — typecheck (`tsc --noEmit`). Correr antes de dar por terminado un cambio.
- DB smoke: puerto host **15433**, Adminer http://localhost:8092 (user `calorico` / pass `calorico_smoke` / db `caloricofit`).
- Login smoke: `admin@caloricofit.com` / `Calorico123*2026` (o cédula `V00000000`); vendedor: `vendedor@caloricofit.com`.
- Migración de features sobre DB existente: `docker exec -i caloricofit-smoke-db psql -U calorico -d caloricofit < db/smoke/03_migrate_features.sql`

## Reglas de git (obligatorias)

- Desarrollo diario **siempre en rama `ender`**.
- Merge a `staging` solo cuando esté listo para probar en VPS; merge a `main` solo tras validar staging.
- **Nunca** commitear directo a `main` ni force-push a `main`.
- **Commits solo cuando el usuario lo pida explícitamente.** No commitear por iniciativa propia.

## Secretos (obligatorio)

- Nunca commitear `.env`, `.env.production`, `/opt/backups/.env*` ni keys de Bunny/Supabase/VPS.
- Plantillas: `.env.example` y `.env.production.example`.
- Credenciales del VPS viven en el servidor (`/opt/backups/.env.credentials`), no en git.

## Deploy (workflow `kleynners-deploy`)

VPS Hostkey: `ssh hostkey-vps` (162.141.78.230, user `deploy`), path `/opt/apps/caloricofit`,
slug `caloricofit`. Staging: `http://162.141.78.230:8080` (API en `:8080/api`). Prod: dominio + certbot.
API en VPS vía pm2: `caloricofit-api`. Postgres solo en localhost:5432, nunca exponer público.

Release desde Windows (exige **working tree limpio**, cambios ya commiteados en `ender`):

- `npm run deploy:staging` — merge ender→staging, push, deploy VPS.
- `npm run deploy:main` — merge staging→main, push, deploy VPS.
- `npm run deploy:sync` — solo sync VPS sin merge.
- Equivalente: `.\scripts\release.ps1 staging|main` o `bash scripts/release.sh <target>` con `VPS_APP_SLUG=caloricofit`.

Antes de `main`: dominio en `.env` del VPS (`VITE_LOCAL_API_URL=https://dominio/api`) y nginx + certbot (ver `docs/DEPLOY.md`).

Logs / rollback en VPS:

```bash
ssh hostkey-vps
pm2 logs caloricofit-api --lines 50
docker compose -f docker-compose.prod.yml logs --tail 50
```

Rollback: checkout de la rama anterior y re-ejecutar release/sync.

Backups: cron diario 03:00 UTC-4 en VPS (`/opt/backups/backup-dbs.sh`, sube dumps a Bunny.net).
Manual: `ssh hostkey-vps /opt/backups/backup-dbs.sh`.

## Advertencias del codebase

- Los `patch_*.cjs` de la raíz reescriben TSX: **no re-ejecutarlos a ciegas** (deuda histórica).
- `src/components/POS.tsx` y `AdminDashboard.tsx` son monolitos grandes; editar con cuidado.
- Riesgos conocidos: posible doble resta de stock/puntos (trigger BD + cliente), sellers ven
  `cost_price` con `SELECT *`, schema drift entre Supabase y la app.
- No hay tests ni CI; validar con `npm run lint` y probando en local.
- npm name sigue siendo `react-example` (cosmético).
- Deps muertas: `@google/genai`, `express` (express solo lo usa `server/local-api.mjs`).

## Referencias

- `docs/PROYECTO.md` — análisis completo del proyecto.
- `docs/LOCAL.md`, `docs/LOCAL_DB.md` — setup local y DB smoke.
- `docs/DEPLOY.md` — deploy VPS detallado.
- `.cursor/rules/` — reglas originales (fuente de este archivo).
- `~/.cursor/skills/kleynners-deploy/SKILL.md` — skill de deploy original (también cubre CRM Latin Travel).
