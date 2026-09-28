-- Calórico Fit — 04: seguridad (sesiones + auditoría + hash de passwords)
-- Aplicable sobre DB existente (idempotente):
--   docker exec -i caloricofit-smoke-db psql -U calorico -d caloricofit < db/smoke/04_security.sql

CREATE TABLE IF NOT EXISTS public.sessions (
    token TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON public.sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON public.sessions (expires_at);

CREATE TABLE IF NOT EXISTS public.audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES public.worker_profiles(id) ON DELETE SET NULL,
    actor_email TEXT,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    detail JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON public.audit_log (created_at);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON public.audit_log (entity, action);

-- Hashea passwords que aún estén en texto plano (bcrypt vía pgcrypto).
-- Las que ya estén hasheadas empiezan con '$2' y no se tocan.
UPDATE public.worker_profiles
SET password = crypt(password, gen_salt('bf'))
WHERE password IS NOT NULL AND password NOT LIKE '$2%';
