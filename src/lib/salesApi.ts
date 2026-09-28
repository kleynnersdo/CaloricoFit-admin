import { authHeaders, getApiBase } from './apiClient';

type ApiResult<T> = { data: T | null; error: { message: string; code?: string } | null };

async function parseJson<T>(res: Response): Promise<ApiResult<T>> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof json?.error === 'string'
        ? json.error
        : json?.error?.message || json?.message || `HTTP ${res.status}`;
    return {
      data: null,
      error: { message: msg, code: json?.error?.code || `HTTP_${res.status}` },
    };
  }
  if (json?.error?.message) {
    return { data: null, error: { message: String(json.error.message) } };
  }
  return { data: (json.data ?? null) as T | null, error: null };
}

export async function checkoutSale(payload: {
  sale: Record<string, unknown>;
  items: Array<{
    product_id: string;
    quantity: number;
    unit_price_usd: number;
    subtotal_usd: number;
  }>;
}): Promise<ApiResult<Record<string, unknown>>> {
  const res = await fetch(`${getApiBase()}/sales/checkout`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function voidSale(saleId: string): Promise<ApiResult<{ id: string; status: string }>> {
  const res = await fetch(`${getApiBase()}/sales/${encodeURIComponent(saleId)}/void`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return parseJson(res);
}

export async function purgeEntity(
  entity: 'sales' | 'cash_closures',
  since?: string | null
): Promise<ApiResult<{ deleted: number }>> {
  const res = await fetch(`${getApiBase()}/admin/purge`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ entity, since: since || undefined }),
  });
  return parseJson<{ deleted: number }>(res);
}
