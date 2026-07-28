// Interfaces Tipadas para el Frontend

export type AppRole = 'admin' | 'seller';

export interface Product {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  barcode: string;
  sku: string;
  sale_price: number;
  cost_price: number; // Important for calculating profits
  stock_quantity: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface Customer {
  id: string;
  document_id: string; // Cédula
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  city: string;
  loyalty_points: number;
}

export interface PaymentMethod {
  id: string;
  name: string;
  currency: string;
  discount_percentage: number;
  surcharge_percentage?: number;
  is_active: boolean;
}

