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
  /** Precio unitario USD fijado al agregar (no depende del snapshot roto en pantalla). */
  unitPriceUsd?: number;
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

/** Postgres / JSON a veces devuelve NUMERIC como string. */
export function coerceMoney(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value).trim().replace(/\s/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeProduct(raw: Product): Product {
  const extra = raw as Product & Record<string, unknown>;
  return {
    ...raw,
    sale_price: coerceMoney(extra.sale_price ?? extra.retail_price ?? extra.price ?? extra.unit_price),
    cost_price: coerceMoney(raw.cost_price),
    wholesale_price: coerceMoney(raw.wholesale_price),
    min_wholesale_qty: coerceMoney(raw.min_wholesale_qty),
    stock_quantity: coerceMoney(raw.stock_quantity),
  };
}

/** Precio actualizado desde inventario si el snapshot del carrito no trae sale_price. */
export function resolveCartProduct(item: CartItem, inventory?: Product[]): Product {
  const id = String(item.product.id);
  const fresh = inventory?.find((p) => String(p.id) === id);
  return normalizeProduct(fresh ?? item.product);
}

export function cartUnitPriceUsd(item: CartItem, inventory?: Product[]): number {
  const snap = item.unitPriceUsd;
  if (snap != null && Number.isFinite(snap) && snap > 0) return snap;
  return lineUnitPrice(item, inventory);
}

export function cartLineQty(item: CartItem): number {
  const q = Math.floor(Number(item.quantity));
  return Number.isFinite(q) && q > 0 ? q : 0;
}

export function lineUnitPrice(item: CartItem, inventory?: Product[]): number {
  const product = resolveCartProduct(item, inventory);
  if (item.isWholesale && product.wholesale_price > 0) {
    return product.wholesale_price;
  }
  return product.sale_price;
}

export function cartLineSubtotalUsd(item: CartItem, inventory?: Product[]): number {
  const qty = cartLineQty(item);
  if (qty <= 0) return 0;
  return cartUnitPriceUsd(item, inventory) * qty;
}

export function sumCartSubtotalUsd(cart: CartItem[], inventory?: Product[]): number {
  return cart.reduce((sum, item) => sum + cartLineSubtotalUsd(item, inventory), 0);
}
