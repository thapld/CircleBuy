# End-to-End Implementation Plan

## Phase A: Foundation (Day 1)

1. Finalize architecture and env matrix.
2. Scaffold monorepo (`web`, `worker`, `contracts`, `db`).
3. Add CI workflow and deployment config.

## Phase B: Contract layer (Day 2)

1. Implement `ArcGroupFactory` and `ArcGroupDeal`.
2. Cover lifecycle transitions and settlement rules.
3. Write Foundry tests for happy path and expiry path.

## Phase C: Data + indexing (Day 3)

1. Apply Supabase schema migration.
2. Implement worker log sync (`DealCreated`).
3. Add cursor-based sync state and idempotent upserts.

## Phase D: API + web baseline (Day 4)

1. Build Next.js APIs (`health`, `deals`, `invites`).
2. Integrate DB layer and payload validation.
3. Provide UI baseline for status and smoke tests.

## Phase E: Deployment (Day 5)

1. Connect GitHub repo to Vercel (`apps/web`).
2. Connect GitHub repo to Railway (`apps/worker`).
3. Configure Supabase pooler `DATABASE_URL` in both services.

## Phase F: Operational hardening (Day 6)

1. Add structured logging and alert channels.
2. Add cron/monitor checks for worker lag.
3. Define rollback and incident playbook.

## Phase G: Pilot execution (Day 7)

1. Run 3 private group-buy pilots.
2. Measure completion and refund latency.
3. Collect blockers and prioritize phase-2 backlog.

## Migration path to VPS (later scale)

1. Keep same application code and migrations.
2. Move worker to Docker on VPS/K8s.
3. Migrate PostgreSQL from Supabase dump/replication.
4. Point `DATABASE_URL` and restart services.

