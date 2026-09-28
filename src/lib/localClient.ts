const STORAGE_KEY = 'calorico.local.session';

const listeners = new Set<(event: string, session: AppSession | null) => void>();

function readSession(): AppSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AppSession) : null;
  } catch {
    return null;
  }
}

function writeSession(session: AppSession | null) {
  if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else localStorage.removeItem(STORAGE_KEY);
  listeners.forEach((cb) => cb(session ? 'SIGNED_IN' : 'SIGNED_OUT', session));
}

import { getApiBase, type AppSession } from './apiEnv';

export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const session = readSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extra };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

type Filter = { op: string; col: string; val: unknown };

class LocalQuery {
  private table: string;
  private action: string = 'select';
  private selectCols: string = '*';
  private filters: Filter[] = [];
  private payload: any = null;
  private orderBy: { column: string; ascending?: boolean } | null = null;
  private limitN: number | null = null;
  private wantSingle = false;
  private wantMaybeSingle = false;

  constructor(table: string) {
    this.table = table;
  }

  select(cols: string = '*') {
    // Supabase: .insert().select() means INSERT ... RETURNING, not a new SELECT.
    if (this.action !== 'insert' && this.action !== 'update' && this.action !== 'upsert') {
      this.action = 'select';
    }
    this.selectCols = cols;
    return this;
  }

  insert(data: any) {
    this.action = 'insert';
    this.payload = data;
    return this;
  }

  update(data: any) {
    this.action = 'update';
    this.payload = data;
    return this;
  }

  upsert(data: any, _opts?: unknown) {
    this.action = 'upsert';
    this.payload = data;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  eq(col: string, val: unknown) {
    this.filters.push({ op: 'eq', col, val });
    return this;
  }

  neq(col: string, val: unknown) {
    this.filters.push({ op: 'neq', col, val });
    return this;
  }

  in(col: string, val: unknown[]) {
    this.filters.push({ op: 'in', col, val });
    return this;
  }

  gt(col: string, val: unknown) {
    this.filters.push({ op: 'gt', col, val });
    return this;
  }

  gte(col: string, val: unknown) {
    this.filters.push({ op: 'gte', col, val });
    return this;
  }

  lt(col: string, val: unknown) {
    this.filters.push({ op: 'lt', col, val });
    return this;
  }

  lte(col: string, val: unknown) {
    this.filters.push({ op: 'lte', col, val });
    return this;
  }

  ilike(col: string, val: unknown) {
    this.filters.push({ op: 'ilike', col, val });
    return this;
  }

  or(expr: string) {
    this.filters.push({ op: 'or', col: '', val: expr });
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: opts?.ascending };
    return this;
  }

  limit(n: number) {
    this.limitN = n;
    return this;
  }

  single() {
    this.wantSingle = true;
    return this;
  }

  maybeSingle() {
    this.wantMaybeSingle = true;
    return this;
  }

  run() {
    return this.execute();
  }

  async execute() {
    const res = await fetch(`${getApiBase()}/db`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        table: this.table,
        action: this.action,
        select: this.selectCols,
        filters: this.filters,
        data: this.payload,
        order: this.orderBy,
        limit: this.limitN,
        single: this.wantSingle,
        maybeSingle: this.wantMaybeSingle,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      const msg =
        typeof json?.error === 'string'
          ? json.error
          : json?.error?.message || `HTTP ${res.status}`;
      if (res.status === 401) {
        writeSession(null);
      }
      return {
        data: null,
        error: {
          message: msg,
          code: json?.error?.code || (res.status === 401 ? '401' : `HTTP_${res.status}`),
        },
      };
    }
    return json;
  }
}

export type DbResult = { data: any; error: { message: string; code?: string } | null };

/** Builder encadenable que se puede `await` sin thenable custom (TS 5.8). */
function awaitableQuery(q: LocalQuery): LocalQuery & Promise<DbResult> {
  return new Proxy(q, {
    get(target, prop) {
      if (prop === 'then') {
        return (onF: (v: DbResult) => unknown, onR?: (e: unknown) => unknown) =>
          target.execute().then(onF, onR);
      }
      if (prop === 'catch') {
        return (onR: (e: unknown) => unknown) => target.execute().catch(onR);
      }
      if (prop === 'finally') {
        return (onF: () => void) => target.execute().finally(onF);
      }
      const val = Reflect.get(target, prop, target);
      if (typeof val === 'function') {
        return (...args: unknown[]) => awaitableQuery(val.apply(target, args));
      }
      return val;
    },
  }) as LocalQuery & Promise<DbResult>;
}

export function createLocalClient() {
  return {
    from(table: string) {
      return awaitableQuery(new LocalQuery(table));
    },
    auth: {
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const res = await fetch(`${getApiBase()}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: email, password }),
        });
        const json = await res.json();
        if (!res.ok) {
          return { data: { session: null, user: null }, error: { message: json.error || 'Login failed' } };
        }
        writeSession(json.session);
        return { data: { session: json.session, user: json.session.user }, error: null };
      },
      async signUp({
        email,
        password,
        options,
      }: {
        email: string;
        password: string;
        options?: { data?: Record<string, unknown> };
      }) {
        const meta = options?.data || {};
        const res = await fetch(`${getApiBase()}/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            first_name: meta.first_name,
            last_name: meta.last_name,
            document_id: meta.document_id,
            phone: meta.phone,
            role: meta.role || 'seller',
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          return { data: { user: null }, error: { message: json.error || 'Signup failed' } };
        }
        return { data: { user: json.user }, error: null };
      },
      async signOut() {
        const session = readSession();
        if (session?.access_token) {
          try {
            await fetch(`${getApiBase()}/auth/logout`, {
              method: 'POST',
              headers: authHeaders(),
            });
          } catch {
            /* ignore */
          }
        }
        writeSession(null);
        return { error: null };
      },
      async getSession() {
        return { data: { session: readSession() }, error: null };
      },
      async getUser() {
        const session = readSession();
        return { data: { user: session?.user || null }, error: null };
      },
      onAuthStateChange(callback: (event: string, session: AppSession | null) => void) {
        listeners.add(callback);
        // Emit current session once on subscribe
        queueMicrotask(() => callback(readSession() ? 'INITIAL_SESSION' : 'SIGNED_OUT', readSession()));
        return {
          data: {
            subscription: {
              unsubscribe: () => listeners.delete(callback),
            },
          },
        };
      },
    },
  };
}

export const api = createLocalClient();
