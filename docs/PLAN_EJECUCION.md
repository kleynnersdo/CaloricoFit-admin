# Calórico Fit — Plan de ejecución

> **Sin Supabase** — solo Postgres + `server/local-api.mjs`  
> Rama: `ender` · Validación: `npm run lint` + `npm run smoke:sales` (con Docker)

## Registro de avance

| Fase | Estado | Notas |
|------|--------|-------|
| S Cero Supabase | hecho | `apiClient`, deps removidas, schema archivado |
| 1 Ventas transaccionales | hecho | checkout + void en POS/Admin |
| 2 Purge auditado | hecho | `/admin/purge` en UI |
| 3 PostgREST / RPC | hecho | métricas y cierres sin embeds; sin RPC stock |
| 6A Métricas cajitas | hecho | `calculateMetrics` refactor |
| 6B Errores visibles | parcial | toasts en métricas; ampliar en futuro |
| 11 Smoke script | hecho | `npm run smoke:sales` |
| 10 Deploy staging | pendiente usuario | requiere `npm run deploy:staging` con git limpio + VPS |
| 4–5–7–8 Regresión | manual | probar en tienda tras deploy |

## Baseline (403 / métricas $0)

- **403 al cobrar:** el POS usaba `insert` en `/db`; corregido con `/sales/checkout`.
- **Cajitas en $0:** selects PostgREST + `sale_items.created_at` inexistente; corregido en Admin.

## Prueba rápida

```bash
npm run db:up
npm run dev:local
# otra terminal:
npm run smoke:sales
```

Login: `docs/LOCAL_DB.md`.

## Deploy

Cuando el usuario lo pida: commit en `ender` → `npm run deploy:staging` → validar venta/void en VPS.
