-- tipsterVIP (Elite Tipsters) — Supabase schema.
-- Run once in a NEW Supabase project's SQL editor (Settings > SQL Editor).
-- Both tables are only ever touched by the server (service-role key) — the
-- Vercel functions in api/ AND the kick-bot/ daily scheduler both use it —
-- so RLS is enabled with no public policies; the anon key gets zero access.

create extension if not exists pgcrypto;

create table if not exists invite_links (
  id uuid primary key default gen_random_uuid(),
  link text not null,
  plan text not null,
  duration_days integer not null default 0,
  subscription_expires_at timestamptz not null,
  stripe_session_id text unique not null,
  customer_email text,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  telegram_username text,
  telegram_name text not null default '',
  plan text not null,
  expires_at timestamptz not null,
  invite_link_id uuid references invite_links(id),
  active boolean not null default true,
  kicked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists subscriptions_telegram_user_id_idx on subscriptions (telegram_user_id);
create index if not exists invite_links_stripe_session_id_idx on invite_links (stripe_session_id);

alter table invite_links enable row level security;
alter table subscriptions enable row level security;
-- No policies defined: only the service-role key (used server-side in api/_lib/supabaseAdmin.js)
-- can read/write these tables. The anon key is never used by this project.
