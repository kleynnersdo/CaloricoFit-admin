const STORAGE_KEY = 'calorico.local.session';

type LocalSession = {
  access_token: string;
  token_type: string;
  user: {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  };
};

const listeners = new Set<(event: string, session: LocalSession | null) => void>();

function readSession(): LocalSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LocalSession) : null;
  } catch {
    return null;
  }
}

function writeSession(session: LocalSession | null) {
  if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else localStorage.removeItem(STORAGE_KEY);
  listeners.forEach((cb) => cb(session ? 'SIGNED_IN' : 'SIGNED_OUT', session));
}

function apiBase() {
  return (import.meta as any).env.VITE_LOCAL_API_URL || 'http://localhost:3032';
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
    this.action = 'select';
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

  then(resolve: any, reject?: any) {
    return this.execute().then(resolve, reject);
  }

  private async execute() {
    const res = await fetch(`${apiBase()}/db`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    if (!res.ok && !json?.error) {
      return { data: null, error: { message: `HTTP ${res.status}` } };
    }
    return json;
  }
}

export function createLocalClient() {
  return {
    from(table: string) {
      return new LocalQuery(table);
    },
    rpc(name: string, _args?: Record<string, unknown>) {
      return fetch(`${apiBase()}/rpc/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(_args || {}),
      }).then(async (res) => {
        const json = await res.json();
        return json;
      });
    },
    auth: {
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const res = await fetch(`${apiBase()}/auth/login`, {
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
        const res = await fetch(`${apiBase()}/auth/signup`, {
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
      onAuthStateChange(callback: (event: string, session: LocalSession | null) => void) {
        listeners.add(callback);
        // Emit current session once (like supabase)
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
