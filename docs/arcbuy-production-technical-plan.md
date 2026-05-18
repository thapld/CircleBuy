# ArcBuy Production Technical Plan (Private Group-Buy on Arc)

Date: 2026-05-18  
Target: Launch fast on Vercel + Supabase + Railway, with migration path to VPS later.

## 1. Product Scope (Production-MVP)

### 1.1 In scope
- Private group-buy deals (invite-only).
- Deal lifecycle:
  - `deposit_open` -> `final_payment_open` -> `ready_to_order` -> `completed`
  - Failure path: `refunding` / `cancelled`
- Organizer creates deal with invite policy, pricing, min/max participants, deadlines.
- Participant joins deal via signed invite token + wallet address.
- On-chain deal creation event ingestion into DB.
- Basic operational dashboard:
  - Active deals
  - Participant counts
  - Lifecycle status
- Health/readiness endpoints for web and worker.

### 1.2 Out of scope (next phase)
- Full dispute arbitration UI.
- Fiat on-ramp integration.
- Automatic oracle adapters for carriers (DHL/FedEx) in production.
- Multi-tenant B2B role/permission console.
- Gas sponsorship system.

## 2. Architecture

### 2.1 Services
- `apps/web` (Next.js):
  - SSR UI + REST APIs.
  - Invite verification and deal membership operations.
  - Vercel deploy target.
- `apps/worker` (Node/TypeScript):
  - Index `DealCreated` events from Arc factory.
  - Lifecycle sweeps for expired deals.
  - Railway deploy target.
- `Supabase Postgres`:
  - System-of-record for read models, memberships, invite tokens, sync cursor.
- `contracts` (Foundry):
  - `ArcGroupFactory` + `ArcGroupDeal`.

### 2.2 Environments
- `dev`: local Postgres/Supabase.
- `staging`: Arc testnet staging factory.
- `production`: Arc testnet production factory.

## 3. Data Model

### 3.1 Core tables
- `deals`
  - business identity, pricing, lifecycle state, deadlines.
  - on-chain references: `deal_address`, `tx_hash`, `block_number`.
- `deal_memberships`
  - participant wallet, role, joined_at.
- `invite_tokens`
  - signed token metadata, deal binding, expiry, max-uses, current uses.
- `chain_events`
  - immutable event ingestion log.
- `sync_state`
  - worker cursor (idempotent sync).
- `audit_logs`
  - critical actions (`create_deal`, `join_deal`, `status_transition`).

### 3.2 Constraints
- unique `deal_address`.
- unique `(deal_id, participant_wallet)`.
- invite token must match both `deal_id` and expiry constraints.

## 4. API Contract (Web)

### 4.1 Deal APIs
- `GET /api/deals`
  - List latest deals, optional status filter.
- `POST /api/deals`
  - Create off-chain deal metadata and signed invite token.
  - Optional `autoCreateOnchain` flag for future use.
- `GET /api/deals/:dealAddress`
  - Deal detail + membership summary.

### 4.2 Invite APIs
- `POST /api/invites/verify`
  - Verify signed token, expiry, uses, and target deal.
- `POST /api/deals/:dealAddress/join`
  - Join via signed token + wallet.
  - Increments invite usage (transaction-safe).

### 4.3 Ops APIs
- `GET /api/health`
  - liveness.
- `GET /api/readiness`
  - checks DB connectivity and mandatory envs.

## 5. Invite Security Model

### 5.1 Token format
- Signed server token (HMAC-SHA256) includes:
  - `dealAddress`
  - `inviteCodeHash`
  - `exp`
  - `nonce`
  - `maxUses`
- Token transported as opaque base64url payload + signature.

### 5.2 Validation
- Reject when:
  - signature invalid
  - expired
  - token bound to different deal
  - usage exceeds cap

## 6. On-chain / Off-chain Flow

### 6.1 Create
1. Organizer sets deal params in web.
2. Web stores draft deal + invite token.
3. Organizer calls factory on Arc (wallet).
4. Worker ingests `DealCreated` and upserts canonical deal state.

### 6.2 Join
1. Participant opens invite link.
2. Web verifies token.
3. Participant submits wallet.
4. Web writes membership and updates participant counter.

### 6.3 Lifecycle reconciliation
- Worker periodically:
  - pulls logs from cursor to latest block.
  - marks expired deals into refund state.
  - writes audit entries for transitions.

## 7. Reliability and Observability

### 7.1 Idempotency
- `on conflict do nothing` for event insertions.
- cursor table transactionally updated after successful batch.

### 7.2 Logging
- structured JSON logs for APIs and worker.
- include request-id / tx-hash / deal-address.

### 7.3 Failure handling
- worker catches iteration error and retries with backoff interval.
- API returns deterministic error codes.

## 8. Security Baseline

- strict zod validation on all write endpoints.
- SQL parameterization (no dynamic interpolation).
- no secret exposure to client bundles.
- environment validation at boot.
- server-side invite signing secret rotation policy.

## 9. Deployment Plan

### 9.1 Supabase
1. Create project.
2. Set pooled `DATABASE_URL`.
3. Apply SQL migrations.

### 9.2 Vercel (`apps/web`)
1. Root directory `apps/web`.
2. Install `npm install`.
3. Build `npm run build`.
4. Configure envs:
   - `DATABASE_URL`
   - `ARC_RPC_URL`
   - `ARC_CHAIN_ID`
   - `ESCROW_FACTORY_ADDRESS`
   - `INVITE_SIGNING_SECRET`
   - public vars.

### 9.3 Railway (`apps/worker`)
1. Root directory `apps/worker`.
2. Build `npm run build`.
3. Start `npm run start`.
4. Configure envs including `WORKER_START_BLOCK`.

## 10. Migration Path to VPS

When traffic grows:
- move web+worker from serverless to containerized apps on VPS/K8s.
- keep Supabase first; migrate DB later with logical replication.
- introduce Redis for distributed rate-limits and queues.
- split worker into:
  - event indexer
  - lifecycle scheduler
  - oracle ingestion.

## 11. Acceptance Criteria

- Create private deal and generate invite link.
- Join with valid invite succeeds; invalid/expired invite fails.
- Deal list/detail APIs stable and typed.
- Worker syncs from factory and updates DB cursor.
- `npm run typecheck` and `npm run build` pass.
