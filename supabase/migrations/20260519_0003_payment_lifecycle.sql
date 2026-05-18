alter table deals
  add column if not exists deposit_paid_participants integer not null default 0,
  add column if not exists final_paid_participants integer not null default 0;

alter table deal_memberships
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists deposit_tx_hash text,
  add column if not exists final_paid_at timestamptz,
  add column if not exists final_tx_hash text;

create index if not exists deal_memberships_deposit_paid_idx
  on deal_memberships (deal_id, deposit_paid_at);

create index if not exists deal_memberships_final_paid_idx
  on deal_memberships (deal_id, final_paid_at);
