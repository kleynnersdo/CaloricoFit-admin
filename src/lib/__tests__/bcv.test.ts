import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BCV_RATE,
  parseDolarApiOficial,
  resolveBcvRate,
  vesMarkupMultiplier,
  usdToVes,
  usdToVesReference,
  formatBs,
  formatUsd,
  safeNumber,
} from '../bcv';

describe('DEFAULT_BCV_RATE', () => {
  it('es la tasa de respaldo configurada (36.50)', () => {
    expect(DEFAULT_BCV_RATE).toBe(36.5);
  });
});

describe('parseDolarApiOficial', () => {
  it('acepta promedio/venta/compra como string o número', () => {
    expect(parseDolarApiOficial({ promedio: '36.5' })).toBe(36.5);
    expect(parseDolarApiOficial({ venta: 40 })).toBe(40);
    expect(parseDolarApiOficial({ compra: '35' })).toBe(35);
  });

  it('prioriza promedio > venta > compra', () => {
    expect(parseDolarApiOficial({ promedio: 1, venta: 2, compra: 3 })).toBe(1);
    expect(parseDolarApiOficial({ venta: 2, compra: 3 })).toBe(2);
  });

  it('rechaza valores inválidos y objetos no parseables', () => {
    expect(parseDolarApiOficial(null)).toBeNull();
    expect(parseDolarApiOficial('texto')).toBeNull();
    expect(parseDolarApiOficial({})).toBeNull();
    expect(parseDolarApiOficial({ promedio: 0, venta: -1 })).toBeNull();
  });
});

describe('resolveBcvRate', () => {
  it('devuelve tasas válidas (número o string numérico)', () => {
    expect(resolveBcvRate(40)).toBe(40);
    expect(resolveBcvRate('36.5')).toBe(36.5);
  });

  it('cae al fallback por defecto o personalizado', () => {
    expect(resolveBcvRate(undefined)).toBe(DEFAULT_BCV_RATE);
    expect(resolveBcvRate(0)).toBe(DEFAULT_BCV_RATE);
    expect(resolveBcvRate('abc')).toBe(DEFAULT_BCV_RATE);
    expect(resolveBcvRate(null, 99)).toBe(99);
  });
});

describe('vesMarkupMultiplier', () => {
  it('convierte porcentaje a multiplicador', () => {
    expect(vesMarkupMultiplier(15)).toBeCloseTo(1.15);
    expect(vesMarkupMultiplier('20')).toBeCloseTo(1.2);
    expect(vesMarkupMultiplier(0)).toBe(1);
  });

  it('undefined/NaN → sin recargo', () => {
    expect(vesMarkupMultiplier(undefined)).toBe(1);
    expect(vesMarkupMultiplier('x')).toBe(1);
  });
});

describe('usdToVes', () => {
  it('aplica tasa + markup', () => {
    expect(usdToVes(10, 36.5, 15)).toBeCloseTo(419.75);
    expect(usdToVes(10, 36.5, 0)).toBe(365);
  });

  it('usa la tasa por defecto si la recibida es inválida', () => {
    expect(usdToVes(10, 'x', 0)).toBeCloseTo(365);
  });

  it('USD inválido o cero → 0', () => {
    expect(usdToVes(0, 36.5, 15)).toBe(0);
    expect(usdToVes(-5, 36.5, 15)).toBe(0);
    expect(usdToVes('abc', 36.5, 15)).toBe(0);
  });
});

describe('usdToVesReference', () => {
  it('solo tasa BCV, sin recargo (para factura)', () => {
    expect(usdToVesReference(10, 36.5)).toBe(365);
  });
});

describe('formatBs / formatUsd', () => {
  it('formatea a dos decimales', () => {
    expect(formatBs(36.5)).toBe('36.50');
    expect(formatUsd(10)).toBe('10.00');
  });

  it('no explota con basura', () => {
    expect(formatBs('x')).toBe('0.00');
    expect(formatUsd(undefined)).toBe('0.00');
  });
});

describe('safeNumber', () => {
  it('devuelve el número o el fallback', () => {
    expect(safeNumber(5)).toBe(5);
    expect(safeNumber('7')).toBe(7);
    expect(safeNumber('x', 3)).toBe(3);
    expect(safeNumber(undefined, 12)).toBe(12);
    expect(safeNumber(null)).toBe(0);
  });
});
