# ArcGroup Design Spec

Date: 2026-05-18  
Scope: Production-like launch on Arc testnet with private group-buy flow.

## Goal

Build a private group-buy app where participants join via invite link, pay deposit first, then complete final payment only after minimum participants are reached.

## Product model

- Group type: private only (invite link/token)
- Payment model: deposit + final payment
- Dispute: auto-rule only (no manual arbitrator in phase 1)

## Core user stories

1. Organizer creates a private deal with quantity threshold and deadlines.
2. Participant joins by invite and pays deposit.
3. When minimum participants reached, deal enters final payment phase.
4. Participants complete final payment.
5. If deadlines are missed, anyone can trigger settlement and contract enforces refund policy.
6. Organizer marks order completed and funds release by policy.

## Architecture

- `apps/web`: Next.js frontend + API on Vercel.
- `apps/worker`: long-running worker on Railway for on-chain event indexing and background settlement jobs.
- `packages/db`: shared DB schema + migration scripts.
- `packages/shared`: shared types + contract ABI.
- `contracts`: Foundry smart contracts.
- `Supabase Postgres`: primary data store.

## Contract responsibilities

- Preserve funds in escrow.
- Enforce deal lifecycle transitions.
- Enforce deposit/final-payment deadlines.
- Prevent unilateral organizer withdrawals.
- Emit deterministic events for indexer sync.

## Off-chain responsibilities

- Invite issuance and verification.
- Read model for web UI.
- Notifications and reminders.
- Observability and retries.

## Non-functional requirements

- Idempotent event processing in worker.
- API request logging and error boundaries.
- Structured migrations and rollback-safe deployment.
- Environment separation: development/staging/production.

## Security baseline

- Access control for organizer actions.
- Signature-bound invite tokens with nonce and expiry.
- Rate limiting on join endpoints.
- Secrets only via deployment provider envs.

## Delivery phases

1. Foundation: repo scaffold, schema, CI/CD.
2. Contracts: escrow + factory + tests.
3. Worker: event sync + reconciliation.
4. Web: create/join/pay/status UI + APIs.
5. Hardening: monitoring, load checks, runbook.

## Success metrics

- Deal completion ratio.
- Refund completion latency.
- Indexer lag (seconds).
- API error rate.
- On-chain/off-chain state mismatch count.

