import { authHeaders, getApiBase } from './apiClient';

type ApiResult<T> = { data: T | null; error: { message: string; code?: string } | null };

/** Etiquetas en español para el ledger de aliados. */
export const ALLY_KIND_LABEL: Record<string, string> = {
  earn: 'Venta referida',
  void_reversal: 'Venta anulada',
  redeem_request: 'Solicitud de canje',
  redeem: 'Canje',
  adjust: 'Ajuste',
};

export const ALLY_STATUS_LABEL: Record<string, string> = {
  posted: 'Confirmado',
  pending: 'Pendiente',
  rejected: 'Rechazado',
  cancelled: 'Cancelado',
};

export function allyKindLabel(kind: string): string {
  return ALLY_KIND_LABEL[kind] || 'Movimiento';
}

export function allyStatusLabel(status: string): string {
  return ALLY_STATUS_LABEL[status] || status;
}

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

export type AllyProfile = {
  id: string;
  first_name: string;
  last_name: string;
  document_id?: string | null;
  email?: string | null;
  phone?: string | null;
  promo_code?: string | null;
  ally_points: number;
  is_active?: boolean;
  created_at?: string;
};

export type AllyLedgerRow = {
  id: string;
  ally_id?: string;
  kind: string;
  points: number;
  sale_id?: string | null;
  notes?: string | null;
  status: string;
  created_by?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  created_at: string;
  first_name?: string;
  last_name?: string;
  promo_code?: string;
  ally_balance?: number;
};

export async function lookupPromoCode(code: string): Promise<ApiResult<AllyProfile>> {
  const res = await fetch(`${getApiBase()}/promo/lookup?code=${encodeURIComponent(code)}`, {
    headers: authHeaders(),
  });
  return parseJson(res);
}

export async function listAllies(q?: string): Promise<ApiResult<AllyProfile[]>> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : '';
  const res = await fetch(`${getApiBase()}/allies${qs}`, { headers: authHeaders() });
  return parseJson(res);
}

export async function listAllyLedger(allyId: string): Promise<ApiResult<AllyLedgerRow[]>> {
  const res = await fetch(`${getApiBase()}/allies/${encodeURIComponent(allyId)}/ledger`, {
    headers: authHeaders(),
  });
  return parseJson(res);
}

export async function listRedeemRequests(
  status = 'pending'
): Promise<ApiResult<AllyLedgerRow[]>> {
  const res = await fetch(
    `${getApiBase()}/allies/redeem-requests?status=${encodeURIComponent(status)}`,
    { headers: authHeaders() }
  );
  return parseJson(res);
}

export async function postAllyRedeem(
  allyId: string,
  body: {
    action?: 'approve' | 'reject';
    points?: number;
    notes?: string;
    request_id?: string;
  }
): Promise<ApiResult<AllyLedgerRow | { status: string }>> {
  const res = await fetch(`${getApiBase()}/allies/${encodeURIComponent(allyId)}/redeems`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function updateAlly(
  allyId: string,
  body: {
    first_name?: string;
    last_name?: string;
    promo_code?: string;
    phone?: string;
    document_id?: string;
  }
): Promise<ApiResult<AllyProfile>> {
  const res = await fetch(`${getApiBase()}/allies/${encodeURIComponent(allyId)}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function deleteAlly(
  allyId: string
): Promise<ApiResult<{ id: string; deleted: boolean }>> {
  const res = await fetch(`${getApiBase()}/allies/${encodeURIComponent(allyId)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return parseJson(res);
}

export async function getAllyMe(): Promise<ApiResult<AllyProfile>> {
  const res = await fetch(`${getApiBase()}/ally/me`, { headers: authHeaders() });
  return parseJson(res);
}

export async function getAllyStats(from?: string, to?: string): Promise<
  ApiResult<{ earned: number; redeemed: number; reversed: number; net: number; from: string | null; to: string | null }>
> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString() ? `?${params}` : '';
  const res = await fetch(`${getApiBase()}/ally/stats${qs}`, { headers: authHeaders() });
  return parseJson(res);
}

export async function getAllyLedger(): Promise<ApiResult<AllyLedgerRow[]>> {
  const res = await fetch(`${getApiBase()}/ally/ledger`, { headers: authHeaders() });
  return parseJson(res);
}

export async function requestAllyRedeem(
  points: number,
  notes?: string
): Promise<ApiResult<AllyLedgerRow>> {
  const res = await fetch(`${getApiBase()}/ally/redeem-requests`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ points, notes }),
  });
  return parseJson(res);
}
