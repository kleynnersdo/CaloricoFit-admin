import { authHeaders, getApiBase } from './apiClient';

type ApiResult<T> = { data: T | null; error: { message: string } | null };

async function parseJson<T>(res: Response): Promise<ApiResult<T>> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof json?.error === 'string'
        ? json.error
        : json?.error?.message || json?.message || `HTTP ${res.status}`;
    return { data: null, error: { message: msg } };
  }
  return { data: (json?.data ?? json) as T, error: null };
}

/** Suma (o resta si quantity < 0) unidades al stock de forma atómica. */
export async function addProductStock(
  productId: string,
  quantity: number
): Promise<ApiResult<{ id: string; stock_quantity: number; name: string }>> {
  const res = await fetch(`${getApiBase()}/products/${encodeURIComponent(productId)}/add-stock`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ quantity }),
  });
  return parseJson(res);
}
