-- Seed producción Calórico Fit (sin usuarios demo; el admin se crea en deploy)
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
