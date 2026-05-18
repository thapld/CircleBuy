# ArcBuy (ArcGroup Monorepo)

Production-oriented private group-buy app for Arc testnet, optimized for quick hosting:

- Web/API on Vercel (`apps/web`)
- Worker/indexer on Railway (`apps/worker`)
- Managed PostgreSQL on Supabase
- Smart contracts with Foundry (`contracts`)

## Monorepo structure

```txt
apps/
  web/         Next.js app + API routes
  worker/      Event indexer and settlement worker
packages/
  db/          Drizzle schema + migration runner
  shared/      Shared types and ABIs
contracts/     Solidity contracts + Foundry tests
supabase/
  migrations/  SQL migrations
.github/
  workflows/   CI
```

## Quick start

1. Install Node.js 20+ and npm 10+.
2. Install dependencies:
   - `npm install`
3. Copy environment templates:
   - `apps/web/.env.example` -> `apps/web/.env.local`
   - `apps/worker/.env.example` -> `apps/worker/.env`
4. Run migrations:
   - `npm run db:migrate`
5. Run apps:
   - Web: `npm run dev:web`
   - Worker: `npm run dev:worker`

## Deployment

- Frontend/API: Vercel (root project `apps/web`)
- Worker: Railway (root project `apps/worker`)
- Database: Supabase Postgres (use pooled connection string)

See:

- `docs/superpowers/specs/2026-05-18-arcgroup-design.md`
- `docs/arcbuy-production-technical-plan.md`
- `docs/deployment-runbook.md`

## API highlights (MVP)

- `POST /api/deals`: create/update private deal + generate signed invite token.
- `GET /api/deals`: list deals (supports optional `?status=` filter).
- `GET /api/deals/:dealAddress`: deal detail + memberships.
- `POST /api/invites`: verify invite token.
- `POST /api/deals/:dealAddress/join`: join private deal via signed invite token.
- `GET /api/health`: liveness + db ping.
- `GET /api/readiness`: readiness checks for deploy.
