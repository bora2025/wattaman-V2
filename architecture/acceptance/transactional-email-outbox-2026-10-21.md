# Transactional email outbox production acceptance

- Date: 2026-10-21 (Asia/Phnom_Penh)
- Marketplace commit: `770d867`
- Railway deployment: `492477bb-e836-4290-80e6-906d96a076b1`
- Image digest: `sha256:1027ef6f35aa38cd2b242afd6e9a931406508d129eb4c9219c8281a5c3f9f511`
- Release metadata: `0.1.0-770d867`
- Recovery dump: `/var/lib/postgresql/data/recovery/marketplace-pre-email-outbox-20261021.dump` (804,557 bytes)

## Implemented controls

- Verification and password-reset messages enter an encrypted database outbox before provider delivery.
- Caller-supplied deduplication keys make verification/reset retries idempotent.
- Provider failures no longer fail account creation or password-reset requests after the message is accepted into the outbox.
- Delivery uses bounded exponential retry, a terminal dead-letter state, failure details, and stale-claim recovery.
- Optimistic claims prevent two Marketplace replicas from delivering the same row concurrently.
- Secret-bearing links are encrypted with the production identity keyring and are not stored in plaintext columns.
- Both the discovery root and readiness endpoint expose the deployed release version.

## Verification evidence

- Focused transactional-email suite: 5/5 passed.
- Full Marketplace API suite: 450/450 passed.
- TypeScript production build passed.
- Additive Prisma migration `20261021070000_transactional_email_outbox` applied successfully; both replicas reported 35 migrations and no pending migrations.
- Deployment reached `SUCCESS` with two `RUNNING` instances.
- Public `/health/ready` returned `ready` and version `0.1.0-770d867`.
- Both replicas completed initial outbox sweeps with `delivered: 0`, `failed: 0` and no startup errors.

## Remaining external acceptance

This release makes delivery recoverable but does not certify an external provider. Production still has transactional email disabled under the explicit MFA-only exception. Provider credentials, sender verification, a real delivered-message drill, a deliberate failure/retry drill, and removal of `ALLOW_MFA_ONLY_PRODUCTION=true` remain required.
