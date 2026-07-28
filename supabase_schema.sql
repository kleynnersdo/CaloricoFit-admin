-- ==============================================================================
-- CALÓRICO FIT - ESQUEMA DE BASE DE DATOS Y RLS DE SUPABASE
-- ==============================================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLA DE ROLES Y USUARIOS EMPLEADOS (Extiende auth.users)
CREATE TABLE IF NOT EXISTS public.worker_profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    document_id TEXT,
    email TEXT,
    phone TEXT,
    role TEXT NOT NULL CHECK (role IN ('admin', 'seller')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. TABLA DE CONFIGURACIONES (Tasas BCV, descuentos, etc.)
CREATE TABLE IF NOT EXISTS public.settings (
    id TEXT PRIMARY KEY,
    value NUMERIC NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. TABLA DE PRODUCTOS
CREATE TABLE IF NOT EXISTS public.products (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    sku TEXT UNIQUE,
    barcode TEXT UNIQUE,
    image_url TEXT,
    cost_price NUMERIC(10,2) NOT NULL,
    sale_price NUMERIC(10,2) NOT NULL,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. TABLA DE CLIENTES (CRM)
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    document_id TEXT UNIQUE NOT NULL, -- Cédula
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    city TEXT,
    loyalty_points INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. TABLA DE VENTAS
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    seller_id UUID REFERENCES public.worker_profiles(id),
    customer_id UUID REFERENCES public.customers(id),
    subtotal_usd NUMERIC(10,2) NOT NULL,
    discount_usd NUMERIC(10,2) DEFAULT 0,
    total_usd NUMERIC(10,2) NOT NULL,
    cost_usd NUMERIC(10,2) DEFAULT 0, -- Se agrega para calcular ganancia neta.
    payment_method TEXT NOT NULL,
    currency_used TEXT NOT NULL,
    exchange_rate_applied NUMERIC(10,2) NOT NULL,
    points_earned INTEGER DEFAULT 0,
    points_redeemed INTEGER DEFAULT 0,
    status TEXT DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'VOIDED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. TABLA DE DETALLES DE VENTA (Items)
CREATE TABLE IF NOT EXISTS public.sale_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_usd NUMERIC(10,2) NOT NULL,
    unit_cost_usd NUMERIC(10,2) DEFAULT 0,
    subtotal_usd NUMERIC(10,2) NOT NULL
);

-- 8. TABLA DE GASTOS GLOBALES
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    description TEXT NOT NULL,
    amount_usd NUMERIC(10,2) NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('inventory_purchase', 'recurring', 'other')),
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. TABLA DE GASTOS RECURRENTES
CREATE TABLE IF NOT EXISTS public.recurring_expenses (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    description TEXT NOT NULL,
    amount_usd NUMERIC(10,2) NOT NULL,
    frequency TEXT NOT NULL CHECK (frequency IN ('monthly', 'weekly')),
    next_due_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 10. TABLA DE MÉTODOS DE PAGO
CREATE TABLE IF NOT EXISTS public.payment_methods (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    currency TEXT NOT NULL,
    discount_percentage NUMERIC(5,2) DEFAULT 0,
    surcharge_percentage NUMERIC(5,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- SEGURIDAD A NIVEL DE FILAS (Row Level Security - RLS)
-- ==============================================================================
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.worker_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;

-- Función helper para verificar si el usuario actual es admin
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.worker_profiles WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función helper para verificar si es vendedor
CREATE OR REPLACE FUNCTION is_seller() RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.worker_profiles WHERE id = auth.uid() AND role = 'seller'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================
-- POLÍTICAS GENERALES DE ADMINS
-- ==============================================
DROP POLICY IF EXISTS "Admins have full access to worker_profiles" ON public.worker_profiles;
CREATE POLICY "Admins have full access to worker_profiles" ON public.worker_profiles FOR ALL USING (is_admin());

DROP POLICY IF EXISTS "Admins have full access to expenses" ON public.expenses;
CREATE POLICY "Admins have full access to expenses" ON public.expenses FOR ALL USING (is_admin());

DROP POLICY IF EXISTS "Admins have full access to recurring_expenses" ON public.recurring_expenses;
CREATE POLICY "Admins have full access to recurring_expenses" ON public.recurring_expenses FOR ALL USING (is_admin());

DROP POLICY IF EXISTS "Admins have full access to settings" ON public.settings;
CREATE POLICY "Admins have full access to settings" ON public.settings FOR ALL USING (is_admin());

DROP POLICY IF EXISTS "Admins have full access to payment_methods" ON public.payment_methods;
CREATE POLICY "Admins have full access to payment_methods" ON public.payment_methods FOR ALL USING (is_admin());

DROP POLICY IF EXISTS "Everyone can read settings" ON public.settings;
CREATE POLICY "Everyone can read settings" ON public.settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Everyone can read payment_methods" ON public.payment_methods;
CREATE POLICY "Everyone can read payment_methods" ON public.payment_methods FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can read their own profile" ON public.worker_profiles;
CREATE POLICY "Users can read their own profile" ON public.worker_profiles FOR SELECT USING (id = auth.uid());

-- ==============================================
-- POLÍTICAS: Productos e Inventario
-- ==============================================
-- Vendedores pueden leer productos activos (pero NO editarlos ni ver su costo)
DROP POLICY IF EXISTS "Sellers can view active products" ON public.products;
CREATE POLICY "Sellers can view active products" 
ON public.products FOR SELECT 
USING (is_seller() AND is_active = true);

-- Nota de Seguridad: Para ocultar completamente la columna 'cost_price' a los vendedores,
-- se debe denegar el acceso SELECT a la tabla original y crear una VIEW:
-- CREATE VIEW products_pos AS SELECT id, name, sku, barcode, sale_price, stock_quantity FROM products;
-- o bien usar PostgreSQL Column Level Security: GRANT SELECT (id, name, sale_price) ON products TO authenticated;

-- Admins tienen acceso total a productos
DROP POLICY IF EXISTS "Admins have full access to products" ON public.products;
CREATE POLICY "Admins have full access to products" 
ON public.products FOR ALL 
USING (is_admin());

-- ==============================================
-- POLÍTICAS: Clientes (CRM)
-- ==============================================
-- Vendedores pueden buscar e insertar clientes
DROP POLICY IF EXISTS "Sellers can view and insert customers" ON public.customers;
CREATE POLICY "Sellers can view and insert customers" 
ON public.customers FOR ALL 
USING (is_seller() OR is_admin());

-- ==============================================
-- POLÍTICAS: Ventas (POS)
-- ==============================================
-- Vendedores solo pueden insertar nuevas ventas y ver las SUYAS del día actual (para cierre de caja)
DROP POLICY IF EXISTS "Sellers can insert sales" ON public.sales;
CREATE POLICY "Sellers can insert sales" 
ON public.sales FOR INSERT 
WITH CHECK (is_seller());

DROP POLICY IF EXISTS "Sellers can view their own sales" ON public.sales;
CREATE POLICY "Sellers can view their own sales" 
ON public.sales FOR SELECT 
USING (is_seller() AND seller_id = auth.uid());

DROP POLICY IF EXISTS "Admins have full access to sales" ON public.sales;
CREATE POLICY "Admins have full access to sales" 
ON public.sales FOR ALL 
USING (is_admin());

-- Detalles de ventas
DROP POLICY IF EXISTS "Sellers can insert sale items" ON public.sale_items;
CREATE POLICY "Sellers can insert sale items" 
ON public.sale_items FOR INSERT 
WITH CHECK (is_seller());

DROP POLICY IF EXISTS "Sellers can view sale items" ON public.sale_items;
CREATE POLICY "Sellers can view sale items" 
ON public.sale_items FOR SELECT 
USING (is_seller() OR is_admin());

DROP POLICY IF EXISTS "Admins have full access to sale items" ON public.sale_items;
CREATE POLICY "Admins have full access to sale items" 
ON public.sale_items FOR ALL 
USING (is_admin());

-- ==============================================================================
-- TRIGGERS (Lógica de base de datos)
-- ==============================================================================

-- Trigger para actualizar los puntos de fidelidad del cliente
CREATE OR REPLACE FUNCTION update_loyalty_points_on_sale()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'COMPLETED' THEN
        UPDATE public.customers
        SET loyalty_points = loyalty_points + NEW.points_earned - NEW.points_redeemed
        WHERE id = NEW.customer_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_loyalty_points ON public.sales;
CREATE TRIGGER trigger_update_loyalty_points
AFTER INSERT ON public.sales
FOR EACH ROW
EXECUTE FUNCTION update_loyalty_points_on_sale();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.worker_profiles (id, first_name, last_name, document_id, email, phone, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'first_name', 'Nuevo'),
    COALESCE(new.raw_user_meta_data->>'last_name', 'Usuario'),
    COALESCE(new.raw_user_meta_data->>'document_id', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data->>'phone',
    COALESCE(new.raw_user_meta_data->>'role', 'seller')
  ) ON CONFLICT (id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    document_id = COALESCE(EXCLUDED.document_id, worker_profiles.document_id),
    email = EXCLUDED.email,
    phone = COALESCE(EXCLUDED.phone, worker_profiles.phone),
    role = EXCLUDED.role;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Trigger para restar inventario al generar una venta
CREATE OR REPLACE FUNCTION subtract_inventory_on_sale()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.products
    SET stock_quantity = stock_quantity - NEW.quantity
    WHERE id = NEW.product_id;
    
    -- Validar que no quede en negativo (Opcional, pero recomendado)
    IF (SELECT stock_quantity FROM public.products WHERE id = NEW.product_id) < 0 THEN
        RAISE EXCEPTION 'Inventario insuficiente para el producto %', NEW.product_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_subtract_inventory ON public.sale_items;
CREATE TRIGGER trigger_subtract_inventory
AFTER INSERT ON public.sale_items
FOR EACH ROW
EXECUTE FUNCTION subtract_inventory_on_sale();

-- ==============================================================================
-- INSERCIONES POR DEFECTO
-- ==============================================================================
INSERT INTO public.payment_methods (name, currency, discount_percentage) VALUES
('CASH USD', 'USD', 0),
('USDT', 'USD', 0),
('Zelle', 'USD', 0),
('Pago Móvil (VES)', 'VES', 0),
('Punto de Venta (VES)', 'VES', 0),
('Puntos de Fidelidad', 'POINTS', 0)
ON CONFLICT (name) DO NOTHING;

-- TABLA DE CIERRES DE CAJA
CREATE TABLE IF NOT EXISTS public.cash_closures (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    seller_id UUID REFERENCES public.worker_profiles(id) NOT NULL,
    declared_usd NUMERIC(12, 2) DEFAULT 0,
    declared_usdt NUMERIC(12, 2) DEFAULT 0,
    declared_ves NUMERIC(12, 2) DEFAULT 0,
    system_usd NUMERIC(12, 2) DEFAULT 0,
    system_usdt NUMERIC(12, 2) DEFAULT 0,
    system_ves NUMERIC(12, 2) DEFAULT 0,
    sales_count INTEGER DEFAULT 0,
    sales_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.cash_closures ADD COLUMN IF NOT EXISTS system_usd NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE public.cash_closures ADD COLUMN IF NOT EXISTS system_usdt NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE public.cash_closures ADD COLUMN IF NOT EXISTS system_ves NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE public.cash_closures ADD COLUMN IF NOT EXISTS sales_count INTEGER DEFAULT 0;
ALTER TABLE public.cash_closures ADD COLUMN IF NOT EXISTS sales_data JSONB;

ALTER TABLE public.cash_closures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view closures" ON public.cash_closures;
DROP POLICY IF EXISTS "Users can view closures" ON public.cash_closures;
CREATE POLICY "Users can view closures" ON public.cash_closures FOR SELECT USING ( auth.uid() = seller_id OR is_admin() );

DROP POLICY IF EXISTS "Sellers can insert closures" ON public.cash_closures;
CREATE POLICY "Sellers can insert closures" ON public.cash_closures FOR INSERT WITH CHECK ( auth.uid() = seller_id );

DROP POLICY IF EXISTS "Admins can delete closures" ON public.cash_closures;
CREATE POLICY "Admins can delete closures" ON public.cash_closures FOR DELETE USING ( is_admin() );

-- ACTUALIZACIONES DE ESTRUCTURA PARA SISTEMAS EXISTENTES
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_currency_used_check;

-- 11. TABLA DE CATEGORIAS DE PRODUCTOS Y SUBCATEGORIAS
CREATE TABLE IF NOT EXISTS public.product_categories (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    parent_category TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Modificaciones Idempotentes para Bases de Datos Existentes
ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS parent_category TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS subcategory TEXT;

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins have full access to product_categories" ON public.product_categories;
CREATE POLICY "Admins have full access to product_categories" ON public.product_categories FOR ALL USING (is_admin());
DROP POLICY IF EXISTS "Everyone can read product_categories" ON public.product_categories;
CREATE POLICY "Everyone can read product_categories" ON public.product_categories FOR SELECT USING (true);
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS string_value TEXT;
