alter table deals
  add column if not exists onchain_tx_hash text,
  add column if not exists onchain_block_number numeric(78, 0),
  add column if not exists status_reason text;

create index if not exists deals_updated_at_idx on deals (updated_at desc);
create index if not exists deals_block_idx on deals (onchain_block_number desc);

create table if not exists invite_tokens (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  token_id uuid not null unique,
  invite_code_hash text not null,
  expires_at timestamptz not null,
  max_uses integer not null default 1,
  used_count integer not null default 0,
  revoked boolean not null default false,
  created_by_wallet text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_uses > 0),
  check (used_count >= 0 and used_count <= max_uses)
);

create index if not exists invite_tokens_deal_id_idx on invite_tokens (deal_id);
create index if not exists invite_tokens_expires_at_idx on invite_tokens (expires_at);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_wallet text,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_entity_idx
  on audit_logs (entity_type, entity_id, created_at desc);
