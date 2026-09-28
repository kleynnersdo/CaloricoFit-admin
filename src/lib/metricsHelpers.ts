import { api } from './apiClient';

export type WorkerMini = { first_name?: string; last_name?: string };

export async function fetchWorkerMap(sellerIds: string[]): Promise<Record<string, WorkerMini>> {
  const unique = [...new Set(sellerIds.filter(Boolean))];
  if (!unique.length) return {};
  const { data, error } = await api
    .from('worker_profiles')
    .select('id, first_name, last_name')
    .in('id', unique);
  if (error || !data) return {};
  const map: Record<string, WorkerMini> = {};
  for (const w of data as Array<{ id: string; first_name?: string; last_name?: string }>) {
    map[w.id] = { first_name: w.first_name, last_name: w.last_name };
  }
  return map;
}

export function withWorkerProfile<T extends { seller_id?: string }>(
  row: T,
  map: Record<string, WorkerMini>
): T & { worker_profiles: WorkerMini | null } {
  const w = row.seller_id ? map[row.seller_id] : undefined;
  return {
    ...row,
    worker_profiles: w ? { first_name: w.first_name, last_name: w.last_name } : null,
  };
}

export async function fetchProductNameMap(productIds: string[]): Promise<Record<string, { name: string; sku?: string; category?: string; subcategory?: string }>> {
  const unique = [...new Set(productIds.filter(Boolean))];
  if (!unique.length) return {};
  const { data, error } = await api
    .from('products')
    .select('id, name, sku, category, subcategory')
    .in('id', unique);
  if (error || !data) return {};
  const map: Record<string, { name: string; sku?: string; category?: string; subcategory?: string }> = {};
  for (const p of data as Array<{ id: string; name: string; sku?: string; category?: string; subcategory?: string }>) {
    map[p.id] = p;
  }
  return map;
}
