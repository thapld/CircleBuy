# Deployment Runbook

## Target environments

- `development`: local
- `staging`: Arc testnet staging
- `production`: Arc testnet production

## Services

1. Vercel project for `apps/web`
2. Railway service for `apps/worker`
3. Supabase project for PostgreSQL

## Required secrets

### Shared

- `ARC_RPC_URL`
- `ARC_CHAIN_ID`
- `ESCROW_FACTORY_ADDRESS`
- `DATABASE_URL`

### Web

- `NEXT_PUBLIC_ARC_CHAIN_ID`
- `NEXT_PUBLIC_ARC_RPC_URL`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- `INVITE_SIGNING_SECRET`

### Worker

- `WORKER_START_BLOCK`
- `WORKER_POLL_INTERVAL_MS`

## Database

1. Create Supabase project.
2. Copy pooler connection string (`DATABASE_URL`).
3. Apply SQL in `supabase/migrations`.

## Vercel deploy

1. Connect GitHub repo.
2. Root directory: `apps/web`.
3. Build command: `npm run build`.
4. Install command: `npm install`.
5. Set web env vars.

## Railway deploy

1. Create service from GitHub repo.
2. Root directory: `apps/worker`.
3. Start command: `npm run start`.
4. Set worker env vars.

## Go-live checks

1. Health endpoint returns 200.
2. Readiness endpoint returns 200.
2. Worker sync lag under 60 seconds.
3. Create deal -> emit event -> DB row appears.
4. Create deal returns invite token.
5. Invite verify endpoint accepts token and rejects tampered token.
6. Join flow writes membership row and increments invite usage.
7. Settlement path tested on expired mock deal.

## Rollback plan

1. Pause web writes by setting app read-only flag.
2. Stop worker deployment.
3. Restore DB from latest snapshot.
4. Redeploy previous web/worker commit.
