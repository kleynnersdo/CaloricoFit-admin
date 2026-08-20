# DB local smoke — Calórico Fit

## Modo app local (sin Supabase)

```bash
npm run db:up
npm run dev:local
```

- App: http://localhost:3020  
- API: http://localhost:3032  
- Login: `admin@caloricofit.com` / `123`  
  o cédula `V00000000` / `123`  
  vendedor: `vendedor@caloricofit.com` / `123`

`.env` debe tener `VITE_LOCAL_MODE=true` y `VITE_LOCAL_API_URL=http://localhost:3032`.

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
