create extension if not exists "pgcrypto";

create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  deal_address text not null unique,
  organizer_wallet text not null,
  title text not null,
  invite_code text,
  invite_code_hash text,
  unit_price numeric(78, 0) not null,
  deposit_per_participant numeric(78, 0) not null,
  min_participants integer not null,
  max_participants integer not null,
  current_participants integer not null default 0,
  status text not null default 'deposit_open',
  deposit_deadline_at timestamptz not null,
  final_deadline_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deals_status_idx on deals (status);
create index if not exists deals_organizer_wallet_idx on deals (organizer_wallet);

create table if not exists deal_memberships (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  participant_wallet text not null,
  role text not null default 'participant',
  joined_at timestamptz not null default now(),
  unique (deal_id, participant_wallet)
);

create index if not exists deal_memberships_wallet_idx on deal_memberships (participant_wallet);

create table if not exists chain_events (
  id uuid primary key default gen_random_uuid(),
  chain_id integer not null,
  tx_hash text not null,
  log_index integer not null,
  contract_address text not null,
  event_name text not null,
  payload jsonb not null,
  block_number numeric(78, 0) not null,
  block_timestamp timestamptz,
  created_at timestamptz not null default now(),
  unique (chain_id, tx_hash, log_index)
);

create table if not exists sync_state (
  name text primary key,
  last_block numeric(78, 0) not null,
  updated_at timestamptz not null default now()
);

