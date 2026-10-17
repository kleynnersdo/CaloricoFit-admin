-- Migración idempotente: alianzas (aliados, códigos promo, puntos por producto, ledger)
-- docker exec -i caloricofit-smoke-db psql -U calorico -d caloricofit < db/smoke/05_ally_alliances.sql

ALTER TABLE public.worker_profiles DROP CONSTRAINT IF EXISTS worker_profiles_role_check;
ALTER TABLE public.worker_profiles
  ADD CONSTRAINT worker_profiles_role_check
  CHECK (role IN ('admin', 'seller', 'ally'));

ALTER TABLE public.worker_profiles ADD COLUMN IF NOT EXISTS promo_code TEXT;
ALTER TABLE public.worker_profiles ADD COLUMN IF NOT EXISTS ally_points INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS worker_profiles_promo_code_uidx
  ON public.worker_profiles (promo_code)
  WHERE promo_code IS NOT NULL;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ally_points_per_unit INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS ally_id UUID REFERENCES public.worker_profiles(id);
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS ally_promo_code TEXT;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS ally_points_earned INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS sales_ally_id_idx ON public.sales (ally_id);

CREATE TABLE IF NOT EXISTS public.ally_point_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ally_id UUID NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('earn', 'void_reversal', 'redeem_request', 'redeem', 'adjust')),
    points INTEGER NOT NULL,
    sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'posted'
      CHECK (status IN ('posted', 'pending', 'rejected', 'cancelled')),
    created_by UUID REFERENCES public.worker_profiles(id) ON DELETE SET NULL,
    resolved_by UUID REFERENCES public.worker_profiles(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS ally_point_ledger_ally_id_idx ON public.ally_point_ledger (ally_id);
CREATE INDEX IF NOT EXISTS ally_point_ledger_status_idx ON public.ally_point_ledger (status);
CREATE INDEX IF NOT EXISTS ally_point_ledger_created_at_idx ON public.ally_point_ledger (created_at);

-- Demo aliado solo en seed local (02_seed.sql), no en prod.
