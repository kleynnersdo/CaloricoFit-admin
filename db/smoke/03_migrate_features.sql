-- Migración idempotente: variantes, mayor, gasto único, anulación de ventas
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS flavor TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_wholesale_qty INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS is_wholesale BOOLEAN DEFAULT false;

ALTER TABLE public.recurring_expenses DROP CONSTRAINT IF EXISTS recurring_expenses_frequency_check;
ALTER TABLE public.recurring_expenses
  ADD CONSTRAINT recurring_expenses_frequency_check
  CHECK (frequency IN ('monthly', 'weekly', 'once'));
