# DB local smoke — Calórico Fit

## Modo app local (sin Supabase)

```bash
npm run db:up
npm run dev:local
```

- App: http://localhost:3020  
- API: http://localhost:3032  
- Login: `admin@caloricofit.com` / `Calorico123*2026`  
  o cédula `V00000000` / `Calorico123*2026`  
  vendedor: `vendedor@caloricofit.com` / `Calorico123*2026`

`.env` debe tener `VITE_LOCAL_MODE=true` y `VITE_LOCAL_API_URL=http://localhost:3032`.

### Migración de features (DB ya existente)

Si el contenedor Postgres ya tenía datos antiguos, aplica:

```bash
docker exec -i caloricofit-smoke-db psql -U calorico -d caloricofit < db/smoke/03_migrate_features.sql
```

Agrega: `products.flavor`, precios al mayor, `sales.is_wholesale`, anulación (`VOIDED`) y gasto `once`.

---

Postgres + Adminer en Docker (inspección).

## Acceso Adminer / SQL

| Qué | Valor |
|-----|--------|
| Adminer (web) | http://localhost:8092 |
| Server | `db` |
| Usuario | `calorico` |
| Password | `calorico_smoke` |
| Database | `caloricofit` |
| Puerto host | **15433** |

```
postgresql://calorico:calorico_smoke@localhost:15433/caloricofit
```
