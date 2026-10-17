-- Seed smoke Calórico Fit
INSERT INTO public.payment_methods (name, currency, discount_percentage) VALUES
('CASH USD', 'USD', 0),
('USDT', 'USD', 0),
('Zelle', 'USD', 0),
('Pago Móvil (VES)', 'VES', 0),
('Punto de Venta (VES)', 'VES', 0),
('Puntos de Fidelidad', 'POINTS', 0)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.settings (id, value, string_value, text_value) VALUES
('ves_markup_percentage', 5, NULL, NULL),
('loyalty_rate', 1, NULL, NULL),
('whatsapp_message', 0, 'Gracias por tu compra en Calórico Fit', 'Gracias por tu compra en Calórico Fit')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.product_categories (name, description) VALUES
('Proteínas', 'Suplementos proteicos'),
('Creatina', 'Creatinas y fuerza'),
('Accesorios', 'Equipos y accesorios')
ON CONFLICT (name) DO NOTHING;

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'admin@caloricofit.com',
  '{"first_name":"Admin","last_name":"Smoke","role":"admin","document_id":"V00000000"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.worker_profiles (id, first_name, last_name, document_id, email, role, is_active, password)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Admin', 'Smoke', 'V00000000', 'admin@caloricofit.com', 'admin', true, crypt('Calorico123*2026', gen_salt('bf'))
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'vendedor@caloricofit.com',
  '{"first_name":"Vendedor","last_name":"Demo","role":"seller","document_id":"V11111111"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.worker_profiles (id, first_name, last_name, document_id, email, role, is_active, password)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'Vendedor', 'Demo', 'V11111111', 'vendedor@caloricofit.com', 'seller', true, crypt('Calorico123*2026', gen_salt('bf'))
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  'aliado@caloricofit.com',
  '{"first_name":"Aliado","last_name":"Demo","role":"ally","document_id":"V22222222"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.worker_profiles (id, first_name, last_name, document_id, email, role, promo_code, ally_points, is_active, password)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  'Aliado', 'Demo', 'V22222222', 'aliado@caloricofit.com', 'ally', 'ALIADO1', 0, true, crypt('Calorico123*2026', gen_salt('bf'))
)
ON CONFLICT (id) DO NOTHING;

UPDATE public.worker_profiles
SET password = crypt('Calorico123*2026', gen_salt('bf'))
WHERE email IN ('admin@caloricofit.com', 'vendedor@caloricofit.com', 'aliado@caloricofit.com')
  AND password NOT LIKE '$2%';

INSERT INTO public.products (name, category, sku, barcode, cost_price, sale_price, stock_quantity, ally_points_per_unit, is_active)
VALUES
('Whey Protein 2lb', 'Proteínas', 'WP-001', '7501000000011', 18.00, 32.00, 25, 10, true),
('Creatina 300g', 'Creatina', 'CR-001', '7501000000028', 8.00, 15.00, 40, 5, true),
('Shaker 600ml', 'Accesorios', 'SH-001', '7501000000035', 2.50, 6.00, 50, 2, true)
ON CONFLICT DO NOTHING;

UPDATE public.products SET ally_points_per_unit = 10 WHERE sku = 'WP-001' AND COALESCE(ally_points_per_unit, 0) = 0;
UPDATE public.products SET ally_points_per_unit = 5 WHERE sku = 'CR-001' AND COALESCE(ally_points_per_unit, 0) = 0;
UPDATE public.products SET ally_points_per_unit = 2 WHERE sku = 'SH-001' AND COALESCE(ally_points_per_unit, 0) = 0;

INSERT INTO public.customers (document_id, first_name, last_name, phone, city, loyalty_points)
VALUES
('V12345678', 'Cliente', 'Demo', '04141234567', 'Caracas', 100)
ON CONFLICT (document_id) DO NOTHING;
