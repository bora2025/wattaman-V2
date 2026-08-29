# Phase F Publisher Governance Evidence — 2026-08-29

This dossier distinguishes platform implementation from the external pilot required by Gate F2. It does not claim that real publishers were invited or that legal/finance policy approval occurred.

| Work package | State | Evidence |
|---|---|---|
| F-001 | implementation complete; approval pending | Four versioned policy candidates cover agreement, acceptable use, privacy/security, and revenue/refund/support. The API publishes version/hash/effective date and retains version-specific publisher/account acceptance records. Legal, Finance, Security, and Product must approve effective text. |
| F-002 | implemented | Publisher organizations require verified-email/MFA owners. Membership has scoped roles. Two distinct official marketplace reviewers verify an organization. Signing-key enrollment and approval/revocation require separate actors; the final active key cannot be revoked before replacement. Audit records retain decisions. |
| F-003 | implemented | Submission accepts a trusted signed `.wtp`, verifies manifest/checksums/dependencies/migrations/license, scans extracted content for secrets and command-execution patterns, queries dependency advisories, records findings/risk, and rejects blocking findings. |
| F-004 | implemented | Submission/review evidence is durable. Submitters cannot self-review; each reviewer has one decision. High-risk capabilities or destructive migrations require two distinct official reviewer approvals before publication. |
| F-005 | documented | [Publisher support and escalation](../marketplace/publisher-support-and-escalation.md) assigns core, marketplace, publisher, finance/refund, and security ownership and response targets. |
| F-006 | implemented/documented | Vulnerable/malicious/abandoned/disputed/transferred procedures preserve evidence and immutable history, reuse atomic withdrawal/advisory controls, and define Gate F2 tabletops. |
| F-007 | not executed | Metrics and invitation-only pilot runbook exist, but acceptance requires 3–5 real invited publishers and 5–10 observed plugins. Synthetic records do not count. |
| F-008 | tooling complete; decision pending | Launch assessment fails closed until update, rejection, rotation, withdrawal, support, and payout outcomes exist. Final go/no-go requires named human functions. |
| F-009 | implemented | Paid order lines create idempotent integer-minor-unit allocations; refunds reverse them; corrections append with two actors; statements retain exact source entries/totals; payouts cannot reuse entries and require requester, approver, and executor separation. |

## Automated evidence

- Eight dedicated tests cover two-reviewer organization verification, key self-approval rejection, two-person risky-release approval, exact/idempotent sale allocation, exact statement totals, payout reconciliation/separation, dual-approved corrections, and fail-closed launch assessment.
- The complete marketplace suite passes 12 suites/107 tests.
- Marketplace TypeScript build and Prisma schema validation pass.
- Migration `20260829010000_publisher_governance_and_revenue` follows the Phase E identity migration.

## Gate status

Gate F0 remains closed. Gate F1 requires policy approvals and migration deployment. Gate F2 requires the real pilot in [controlled-publisher-pilot.md](../operations/controlled-publisher-pilot.md). Public self-service remains disabled.
