import { describe, it, expect } from 'vitest';
import {
  coerceMoney,
  normalizeProduct,
  resolveCartProduct,
  cartUnitPriceUsd,
  cartLineQty,
  lineUnitPrice,
  cartLineSubtotalUsd,
  sumCartSubtotalUsd,
  type Product,
  type CartItem,
} from '../../types';

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 'p1',
  name: 'Whey Protein',
  category: 'Proteínas',
  barcode: '123',
  sku: 'WP-1',
  sale_price: 75,
  cost_price: 50,
  stock_quantity: 10,
  ...overrides,
});

const item = (overrides: Partial<CartItem> = {}): CartItem => ({
  product: product(),
  quantity: 2,
  ...overrides,
});

describe('coerceMoney', () => {
  it('devuelve 0 para null, undefined o string vacío', () => {
    expect(coerceMoney(null)).toBe(0);
    expect(coerceMoney(undefined)).toBe(0);
    expect(coerceMoney('')).toBe(0);
  });

  it('pasa números finitos sin cambios', () => {
    expect(coerceMoney(12.5)).toBe(12.5);
    expect(coerceMoney(0)).toBe(0);
    expect(coerceMoney(-3)).toBe(-3);
  });

  it('convierte strings numéricos, con coma decimal y espacios', () => {
    expect(coerceMoney('10')).toBe(10);
    expect(coerceMoney('10,50')).toBe(10.5);
    expect(coerceMoney(' 10.50 ')).toBe(10.5);
    expect(coerceMoney('1 234,56')).toBe(1234.56);
  });

  it('devuelve 0 para basura y no finitos', () => {
    expect(coerceMoney('abc')).toBe(0);
    expect(coerceMoney('NaN')).toBe(0);
    expect(coerceMoney(Infinity)).toBe(0);
  });
});

describe('normalizeProduct', () => {
  it('normaliza NUMERIC que llegan como string', () => {
    const p = normalizeProduct(
      product({ sale_price: '75.5' as unknown as number, cost_price: '50' as unknown as number })
    );
    expect(p.sale_price).toBe(75.5);
    expect(p.cost_price).toBe(50);
  });

  it('usa fallbacks de precio legacy cuando sale_price es null/undefined', () => {
    const raw = { ...product(), sale_price: undefined, retail_price: 80 } as Product;
    expect(normalizeProduct(raw).sale_price).toBe(80);

    const raw2 = {
      ...product(),
      sale_price: null,
      retail_price: undefined,
      price: 60,
    } as unknown as Product;
    expect(normalizeProduct(raw2).sale_price).toBe(60);

    // Nota: '' (string vacío) NO activa el fallback — `??` solo cubre null/undefined.
    const raw3 = { ...product(), sale_price: '' as unknown as number, retail_price: 80 } as Product;
    expect(normalizeProduct(raw3).sale_price).toBe(0);
  });

  it('normaliza precios al mayor y stock', () => {
    const p = normalizeProduct(
      product({ wholesale_price: '65' as unknown as number, stock_quantity: '12' as unknown as number })
    );
    expect(p.wholesale_price).toBe(65);
    expect(p.stock_quantity).toBe(12);
  });
});

describe('resolveCartProduct', () => {
  it('devuelve el snapshot si no hay inventario', () => {
    const snap = product({ sale_price: 99 });
    expect(resolveCartProduct({ product: snap, quantity: 1 }).sale_price).toBe(99);
  });

  it('prefiere el producto fresco del inventario', () => {
    const snap = product({ sale_price: 99 });
    const fresh = [product({ id: 'p1', sale_price: 70 })];
    expect(resolveCartProduct({ product: snap, quantity: 1 }, fresh).sale_price).toBe(70);
  });
});

describe('cartUnitPriceUsd', () => {
  it('el precio congelado del carrito gana sobre el inventario', () => {
    const it2 = item({ unitPriceUsd: 55 });
    const fresh = [product({ id: 'p1', sale_price: 70 })];
    expect(cartUnitPriceUsd(it2, fresh)).toBe(55);
  });

  it('cae al precio de inventario (mayor) cuando no hay snapshot', () => {
    const wholesale = item({ isWholesale: true });
    const fresh = [product({ id: 'p1', wholesale_price: 60, min_wholesale_qty: 1 })];
    expect(cartUnitPriceUsd(wholesale, fresh)).toBe(60);
  });

  it('ignora snapshots inválidos (0 o negativos)', () => {
    expect(cartUnitPriceUsd(item({ unitPriceUsd: 0 }))).toBe(75);
    expect(cartUnitPriceUsd(item({ unitPriceUsd: -5 }))).toBe(75);
  });
});

describe('cartLineQty', () => {
  it('redondea hacia abajo y rechaza cantidades inválidas', () => {
    expect(cartLineQty(item({ quantity: 3 }))).toBe(3);
    expect(cartLineQty(item({ quantity: 2.9 }))).toBe(2);
    expect(cartLineQty(item({ quantity: 0 }))).toBe(0);
    expect(cartLineQty(item({ quantity: -1 }))).toBe(0);
    expect(cartLineQty(item({ quantity: NaN }))).toBe(0);
  });
});

describe('lineUnitPrice', () => {
  it('usa precio al mayor si el ítem es mayor y el precio existe', () => {
    const fresh = [product({ id: 'p1', wholesale_price: 60 })];
    expect(lineUnitPrice(item({ isWholesale: true }), fresh)).toBe(60);
  });

  it('ignora mayor con precio 0 y usa precio de venta', () => {
    const fresh = [product({ id: 'p1', wholesale_price: 0 })];
    expect(lineUnitPrice(item({ isWholesale: true }), fresh)).toBe(75);
  });

  it('usa precio de venta en modo detalle', () => {
    expect(lineUnitPrice(item(), [product({ id: 'p1' })])).toBe(75);
  });
});

describe('cartLineSubtotalUsd', () => {
  it('multiplica precio unitario × cantidad', () => {
    expect(cartLineSubtotalUsd(item({ quantity: 3, unitPriceUsd: 20 }))).toBe(60);
  });

  it('devuelve 0 con cantidad 0', () => {
    expect(cartLineSubtotalUsd(item({ quantity: 0, unitPriceUsd: 20 }))).toBe(0);
  });
});

describe('sumCartSubtotalUsd', () => {
  it('suma todos los renglones', () => {
    const cart = [
      item({ quantity: 2, unitPriceUsd: 10 }),
      item({ product: product({ id: 'p2' }), quantity: 1, unitPriceUsd: 5 }),
      item({ product: product({ id: 'p3' }), quantity: 4, unitPriceUsd: 2.5 }),
    ];
    expect(sumCartSubtotalUsd(cart)).toBe(35);
  });

  it('carrito vacío → 0', () => {
    expect(sumCartSubtotalUsd([])).toBe(0);
  });
});
