-- Calórico Fit — schema smoke (Postgres local, sin Supabase Auth real)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT,
    raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE TABLE IF NOT EXISTS public.worker_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    document_id TEXT,
    email TEXT,
    phone TEXT,
    role TEXT NOT NULL CHECK (role IN ('admin', 'seller', 'ally')),
    promo_code TEXT,
    ally_points INTEGER NOT NULL DEFAULT 0,
    password TEXT DEFAULT 'Calorico123*2026',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS worker_profiles_promo_code_uidx
  ON public.worker_profiles (promo_code)
  WHERE promo_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.settings (
    id TEXT PRIMARY KEY,
    value NUMERIC NOT NULL DEFAULT 0,
    string_value TEXT,
    text_value TEXT,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    subcategory TEXT,
    flavor TEXT,
    sku TEXT UNIQUE,
    barcode TEXT UNIQUE,
    image_url TEXT,
    cost_price NUMERIC(10,2) NOT NULL DEFAULT 0,
    sale_price NUMERIC(10,2) NOT NULL DEFAULT 0,
    wholesale_price NUMERIC(10,2) NOT NULL DEFAULT 0,
    min_wholesale_qty INTEGER NOT NULL DEFAULT 0,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    ally_points_per_unit INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.product_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    parent_category TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    city TEXT,
    loyalty_points INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seller_id UUID REFERENCES public.worker_profiles(id),
    customer_id UUID REFERENCES public.customers(id),
    subtotal_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
    discount_usd NUMERIC(10,2) DEFAULT 0,
    surcharge_usd NUMERIC(10,2) DEFAULT 0,
    total_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
    cost_usd NUMERIC(10,2) DEFAULT 0,
    payment_method TEXT NOT NULL,
    currency_used TEXT NOT NULL,
    exchange_rate_applied NUMERIC(10,2) NOT NULL DEFAULT 1,
    points_earned INTEGER DEFAULT 0,
    points_redeemed INTEGER DEFAULT 0,
    is_wholesale BOOLEAN DEFAULT false,
    ally_id UUID REFERENCES public.worker_profiles(id),
    ally_promo_code TEXT,
    ally_points_earned INTEGER NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'VOIDED')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

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

CREATE TABLE IF NOT EXISTS public.sale_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_usd NUMERIC(10,2) NOT NULL,
    unit_cost_usd NUMERIC(10,2) DEFAULT 0,
    subtotal_usd NUMERIC(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    description TEXT NOT NULL,
    amount_usd NUMERIC(10,2) NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.recurring_expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    description TEXT NOT NULL,
    amount_usd NUMERIC(10,2) NOT NULL,
    frequency TEXT NOT NULL CHECK (frequency IN ('monthly', 'weekly', 'once')),
    next_due_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    currency TEXT NOT NULL,
    discount_percentage NUMERIC(5,2) DEFAULT 0,
    surcharge_percentage NUMERIC(5,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.cash_closures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seller_id UUID REFERENCES public.worker_profiles(id) NOT NULL,
    declared_usd NUMERIC(12, 2) DEFAULT 0,
    declared_usdt NUMERIC(12, 2) DEFAULT 0,
    declared_ves NUMERIC(12, 2) DEFAULT 0,
    system_usd NUMERIC(12, 2) DEFAULT 0,
    system_usdt NUMERIC(12, 2) DEFAULT 0,
    system_ves NUMERIC(12, 2) DEFAULT 0,
    sales_count INTEGER DEFAULT 0,
    sales_data JSONB,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
