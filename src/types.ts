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

export function lineUnitPrice(item: CartItem): number {
  const retail = Number(item.product.sale_price);
  const wholesale = Number(item.product.wholesale_price);
  if (item.isWholesale && Number.isFinite(wholesale) && wholesale > 0) {
    return wholesale;
  }
  return Number.isFinite(retail) ? retail : 0;
}
