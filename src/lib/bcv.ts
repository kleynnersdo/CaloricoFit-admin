import { GLOBAL_CONFIG } from './utils';

export const DEFAULT_BCV_RATE = GLOBAL_CONFIG.BCV_RATE;

export type OfficialBcv = { rate: number; date: string };

/** Parsea respuesta de ve.dolarapi.com (promedio puede venir como string). */
export function parseDolarApiOficial(json: unknown): number | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  for (const key of ['promedio', 'venta', 'compra']) {
    const n = Number(o[key]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export function resolveBcvRate(rate: unknown, fallback = DEFAULT_BCV_RATE): number {
  const n = Number(rate);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function vesMarkupMultiplier(markupPercentage: unknown): number {
  const pct = Number(markupPercentage);
  const safe = Number.isFinite(pct) ? pct : 0;
  return 1 + safe / 100;
}

export function usdToVes(
  totalUsd: unknown,
  bcvRate: unknown,
  markupPercentage: unknown
): number {
  const usd = Number(totalUsd);
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  const rate = resolveBcvRate(bcvRate);
  const ves = usd * vesMarkupMultiplier(markupPercentage) * rate;
  return Number.isFinite(ves) ? ves : 0;
}

/** Bs. de referencia / factura: solo tasa BCV, sin recargo VES. */
export function usdToVesReference(totalUsd: unknown, bcvRate: unknown): number {
  return usdToVes(totalUsd, bcvRate, 0);
}

export function formatBs(amount: unknown): string {
  const n = Number(amount);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

export function formatUsd(amount: unknown): string {
  const n = Number(amount);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

export function safeNumber(amount: unknown, fallback = 0): number {
  const n = Number(amount);
  return Number.isFinite(n) ? n : fallback;
}

function localApiBase(): string | null {
  const local =
    String((import.meta as any).env.VITE_LOCAL_MODE || '').toLowerCase() === 'true' ||
    String((import.meta as any).env.VITE_LOCAL_MODE || '') === '1';
  if (!local) return null;
  return String((import.meta as any).env.VITE_LOCAL_API_URL || 'http://localhost:3032').replace(/\/$/, '');
}

function bcvProxyUrls(): string[] {
  const urls: string[] = [];
  if (typeof window !== 'undefined' && window.location?.origin) {
    urls.push(`${window.location.origin}/api/public/bcv/oficial`);
  }
  const apiBase = localApiBase();
  if (apiBase) urls.push(`${apiBase}/public/bcv/oficial`);
  return [...new Set(urls)];
}

/** Tasa BCV oficial: proxy local (VPS) y fallback a dolarapi + 36.50. */
export async function fetchOfficialBcv(): Promise<OfficialBcv> {
  const today = new Date().toISOString().split('T')[0];
  const urls: string[] = [...bcvProxyUrls(), 'https://ve.dolarapi.com/v1/dolares/oficial'];

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const json = await response.json();

      let rate: number | null = null;
      let date = today;

      if (json && typeof json === 'object' && 'rate' in json) {
        rate = Number((json as { rate: unknown }).rate);
        const d = (json as { date?: unknown }).date;
        if (d) date = String(d).split('T')[0];
      } else {
        rate = parseDolarApiOficial(json);
        const fa = (json as { fechaActualizacion?: unknown })?.fechaActualizacion;
        if (fa) date = String(fa).split('T')[0];
      }

      if (Number.isFinite(rate) && (rate as number) > 0) {
        return { rate: rate as number, date };
      }
    } catch {
      // siguiente fuente
    }
  }

  return { rate: DEFAULT_BCV_RATE, date: today };
}
