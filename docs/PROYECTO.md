# Calórico Fit Admin — Documentación del proyecto

> Análisis del código en `CaloricoFit-admin` · Fecha: 2026-08-10  
> Rama de trabajo: `ender` · Staging VPS: `staging` · Producción: `main`

---

## 1. Qué es

**Calórico Fit POS / Admin** — SPA de **punto de venta** y **panel administrativo** para venta de suplementos y equipos de gimnasio (retail fitness, Venezuela).

**Permite:**
- Cobrar en tienda (USD, USDT, VES, Zelle, puntos, pagos mixtos)
- Inventario, clientes, vendedores, gastos recurrentes
- Tasa BCV + markup VES, fidelidad, cierre de caja, métricas y export Excel

---

## 2. Stack

| Capa | Tecnología |
|------|------------|
| UI | React 19 + TypeScript |
| Build | Vite 6 |
| Estilos | Tailwind CSS 4 |
| Backend | Supabase (Auth + Postgres + RLS) |
| Extra | date-fns, xlsx, html5-qrcode, html-to-image |

No hay backend propio en runtime. Cliente → Supabase directo.

**Dev local:** `http://localhost:3020` (`npm run dev`)

---

## 3. Arquitectura

```
SPA (React)  →  @supabase/supabase-js  →  Postgres + Auth (Supabase)
```

Sin React Router: el rol (`admin` | `seller`) decide la pantalla.

```
src/
├── App.tsx                 # Auth gate + routing por rol
├── components/
│   ├── Login.tsx
│   ├── POS.tsx             # Vendedor
│   ├── AdminDashboard.tsx  # Admin
│   └── BarcodeScanner.tsx
└── lib/supabase.ts
supabase_schema.sql         # DDL + RLS + triggers
```

---

## 4. Flujo principal

1. Login (cédula→email virtual `{cedula}@caloricofit.com` o email) vía Supabase Auth
2. Lee `worker_profiles` → `admin` → AdminDashboard / `seller` → POS
3. POS: carrito → `sales` + `sale_items` → stock + puntos fidelidad → ticket / WhatsApp
4. Admin: métricas, inventario, gastos, vendedores, clientes, settings

---

## 5. Configuración / env

| Variable | Uso |
|----------|-----|
| `VITE_SUPABASE_URL` | Proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Anon key |
| `GEMINI_API_KEY` / `APP_URL` | Legado AI Studio; no usadas en `src/` |

Sin credenciales válidas usa mock (`src/lib/supabase.ts`) y Login avisa.

---

## 6. Seguridad — nivel: **medio-bajo**

**Bien:** Auth Supabase, RLS en tablas, helpers `is_admin`/`is_seller`, anon key (no service_role), soft-disable vendedores.

**Gaps críticos:**
- Posible **doble resta** de stock/puntos (trigger BD + lógica cliente)
- Sellers ven `cost_price` (`SELECT *`)
- RLS customers muy permisivo para sellers
- Alta de usuarios con `signUp` desde el browser
- Borrado masivo de ventas/cierres desde UI
- Schema drift (`text_value` vs `string_value`, columnas faltantes)

---

## 7. Listo para producción — **no aún (~40–50%)**

| Área | Estado |
|------|--------|
| Features de negocio | Avanzadas (POS + admin usables) |
| Auth / roles UI | Funcional |
| RLS / seguridad dura | Incompleta |
| Env / secrets | Parcial (falta `.env` real en host) |
| Schema sincronizado | Drift |
| CI/CD | No |
| Tests | No |
| Monitoring | No |
| HTTPS / dominio | Depende del host |
| Backups | Solo lo que dé el plan Supabase |

### Checklist mínimo antes de prod
- [ ] Aplicar schema + migraciones alineadas con la app
- [ ] Eliminar duplicación stock/puntos (trigger **o** cliente)
- [ ] Endurecer RLS; ocultar costos a sellers
- [ ] Crear usuarios vía Admin API / Edge Function (no `signUp` browser)
- [ ] Hosting + HTTPS + `.env` de prod
- [ ] Quitar `patch_*.cjs` del flujo de deploy
- [ ] CI básico + smoke tests
- [ ] Política de backups y no-wipe destructivo sin auditoría

---

## 8. Riesgos conocidos

- Scripts `patch_*.cjs` reescriben TSX (deuda; no re-ejecutar a ciegas)
- Componentes monolíticos (`POS`, `AdminDashboard`) difíciles de mantener
- Deps muertas (`@google/genai`, `express`)
- API BCV de terceros (disponibilidad/CORS)
- npm name aún `react-example`

---

## 9. Flujo de ramas

| Rama | Uso |
|------|-----|
| `ender` | Desarrollo diario |
| `staging` | Pruebas en VPS |
| `main` | Producción |

Flujo: `ender` → merge a `staging` (VPS) → merge a `main` (prod).

---

## 10. Arranque local

```bash
cp .env.example .env   # o editar .env existente
# Rellenar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm install
npm run dev            # http://localhost:3020
```

Aplicar `supabase_schema.sql` en el proyecto Supabase si la BD está vacía.
