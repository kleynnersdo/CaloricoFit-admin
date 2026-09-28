// Interfaces Tipadas para el Frontend

export type AppRole = 'admin' | 'seller';

export interface Product {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  flavor?: string;
  barcode: string;
  sku: string;
  sale_price: number;
  cost_price: number;
  wholesale_price?: number;
  min_wholesale_qty?: number;
  stock_quantity: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  isWholesale?: boolean;
}

export interface Customer {
  id: string;
  document_id: string;
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

export function normalizeProduct(raw: Product): Product {
  return {
    ...raw,
    sale_price: Number(raw.sale_price) || 0,
    cost_price: Number(raw.cost_price) || 0,
    wholesale_price: Number(raw.wholesale_price) || 0,
    min_wholesale_qty: Number(raw.min_wholesale_qty) || 0,
    stock_quantity: Number(raw.stock_quantity) || 0,
  };
}

export function lineUnitPrice(item: CartItem): number {
  const retail = Number(item.product.sale_price);
  const wholesale = Number(item.product.wholesale_price);
  if (item.isWholesale && Number.isFinite(wholesale) && wholesale > 0) {
    return wholesale;
  }
  return Number.isFinite(retail) ? retail : 0;
}
