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
  'Admin', 'Smoke', 'V00000000', 'admin@caloricofit.com', 'admin', true, '123'
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
  'Vendedor', 'Demo', 'V11111111', 'vendedor@caloricofit.com', 'seller', true, '123'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.products (name, category, sku, barcode, cost_price, sale_price, stock_quantity, is_active)
VALUES
('Whey Protein 2lb', 'Proteínas', 'WP-001', '7501000000011', 18.00, 32.00, 25, true),
('Creatina 300g', 'Creatina', 'CR-001', '7501000000028', 8.00, 15.00, 40, true),
('Shaker 600ml', 'Accesorios', 'SH-001', '7501000000035', 2.50, 6.00, 50, true)
ON CONFLICT DO NOTHING;

INSERT INTO public.customers (document_id, first_name, last_name, phone, city, loyalty_points)
VALUES
('V12345678', 'Cliente', 'Demo', '04141234567', 'Caracas', 100)
ON CONFLICT (document_id) DO NOTHING;
