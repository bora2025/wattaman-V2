# Threat Model: Installation, Update, Licensing, Marketplace, Payments, Publisher (A-004)

Status: engineering-drafted, technically grounded in the current codebase. **Residual-risk sign-off is a Security-role action, not an engineering one** — every table below ends with a residual-risk row; the sign-off column is left for SEC to complete, dated, per the plan's ADR acceptance format. This document does not claim that sign-off itself.

## Method

For each of the six workflows the master plan names (§7, A-004), this document identifies: the **trust boundary** the workflow crosses, the **abuse cases** an attacker or a misbehaving-but-legitimate actor could attempt, the **mitigation** already built (with the code/test that proves it), and the **residual risk** that remains even with the mitigation in place. A mitigation is only cited if it is implemented and verified today — an *aspirational* mitigation is written as "not yet built," never presented as in place. Cross-references replace re-deriving analysis [data-classification.md](./data-classification.md) and [secrets-inventory.md](../operations/secrets-inventory.md) already did field-by-field.

## Trust boundaries in this system

```
[Anonymous internet] ──▶ [Public gateway] ──▶ [School API] ──▶ [School PostgreSQL]
                                    │                  │
                                    │                  └──▶ [Plugin runtime — IN-PROCESS, no sandbox]
                                    │
[Anonymous internet] ──▶ [Marketplace API] ──▶ [Marketplace PostgreSQL]
                                    │
                    (installation-signed requests, admin-token requests,
                     customer-session requests, publisher-key-signed requests
                     — four distinct authentication classes, one API surface)
```

Two boundaries carry the most weight in what follows: **(a)** the school API and the marketplace API never share a database, secret, or administrator identity ([ADR-0002](./adr/0002-tenancy.md)) — a full compromise of one does not automatically hand over the other; **(b)** the plugin runtime boundary is a *contract*, not a *sandbox* ([ADR-0004](./adr/0004-plugin-trust.md)) — trust is placed at signing time, not enforced at runtime.

## 1. Installation

| # | Abuse case | Mitigation | Evidence |
|---|---|---|---|
| I-1 | Two setup requests race to create a second owner/installation | Transactional creation; second request always fails | `INS-003` — simultaneous setup requests produced exactly one installation and one `SUPER_ADMIN`; repeat returns HTTP 409 |
| I-2 | Unattended CLI installer run with a weak/scriptable password reaching logs or process listings | Sealed password files, non-interactive/exact-slug guard, no owner credential exposed on repeat-run rejection | `INS-005` — Railway PostgreSQL 18 drill installed once, rejected the repeat without exposing owner credentials |
| I-3 | Legacy adoption run against the wrong database, or run twice, silently corrupting/duplicating an existing school | Explicit guard flag, exact-slug match, approved fingerprint required, idempotent resume, recovery backup+manifest+checksum before any write | `DB-004` — synthetic Railway drill preserved owner, created exactly one installation/audit, resumed idempotently |
| I-4 | Browser setup wizard submitted with a forged/replayed request before a real owner exists | Same transactional creation path as I-1; setup endpoint requires no prior session (first-run only) and self-locks after success | `INS-002`/`INS-003` |
| I-5 | Fixed/default administrator seed left in a production image | Removed outright — no seed script runs at startup | `SEC-002` — startup commands no longer invoke `seed-prod.js` |

**Residual risk**: Legacy adoption has been rehearsed only against a **synthetic** fixture; the real-legacy-database rehearsal (B-001/002/003) remains outstanding, so an adoption-specific failure mode unique to real historical data (a schema drift, an orphaned foreign key, a duplicate legacy owner row) is not yet ruled out. **Sign-off**: _pending SEC review, pending B-003 real-data rehearsal_.

## 2. Update

| # | Abuse case | Mitigation | Evidence |
|---|---|---|---|
| U-1 | A malicious party publishes a fake update under a trusted repository identity | Signed core/plugin/advisory index; canonical signatures; trusted-key selection rejects unknown keys | `D-003` |
| U-2 | Replay an old, previously-valid signed update to reintroduce a fixed vulnerability | Downgrade/replay rejection in the compatibility resolver | `D-003` — tested |
| U-3 | Corrupt or truncate an artifact in transit | Immutable-by-digest artifacts; checksum verification before install | `D-001`/`D-007` — checksum and corrupt-artifact drills passed |
| U-4 | Repository signing key compromised | Separate publisher/repository key custody; multi-signature overlap rotation; two-of-three approval | `D-002` — live `repository-2026`/`repository-2027` overlap drill verified old and new clients both still verify |
| U-5 | An update is applied to a school with an incompatible active plugin, breaking it silently | Preflight blocks before backup if an active plugin is out of the new core's compatible range | `D-005` |
| U-6 | An update fails partway through, leaving the school in an undefined state | Native backup + durable maintenance journal before mutation; completion records healthy-or-recovery-required | `D-005` |
| U-7 | A malicious or vulnerable already-published plugin needs emergency removal from the field | Signed, non-destructive emergency-disable; advisory/withdrawal/communication process | `D-006` |

**Residual risk**: ~~Repository-key rotation has a live, drilled overlap procedure; the entitlement signing key does not have an equivalent drill yet.~~ **Closed 2026-08-29** — the entitlement signing key now has an equivalent live drill (`apps/marketplace-api/scripts/entitlement-signing-key-rotation-live-drill.js`, 9/9 checks: overlap coexistence, old-key cutoff on removal, key-id-mismatch and untrusted-key rejection), using the real, unmodified issuing/verification functions on both sides. **Sign-off**: _pending SEC review_.

## 3. Licensing / entitlement

| # | Abuse case | Mitigation | Evidence |
|---|---|---|---|
| L-1 | Forge an entitlement token for a product never purchased | Ed25519 signature verified locally against a pinned entitlement public key | `E-004` — tested |
| L-2 | Replay a valid token from Installation A against Installation B | Installation-ID binding checked as part of local verification | `E-004`/`E-010` — cross-installation replay rejection tested |
| L-3 | Roll the school server's clock backward to resurrect an expired/revoked token | Clock-rollback rejected for new activation | `E-010` — tested |
| L-4 | Marketplace is unreachable (outage) and a school needs its already-purchased plugin to keep working | Fail-**open** on outage: cached entitlement is left completely untouched | `E-005` — verified |
| L-5 | A tampered or wrong-key token is presented to force a fraudulent activation | Fail-**closed** on trust failure: cache left untouched, attempt audit-logged via `AuditService` | `E-005` — verified; failure ≠ silent downgrade even for a 404 on a known plugin |
| L-6 | Steal an installation's private signing key to impersonate it to the marketplace | Proof-of-possession challenge (signed, single-use, 5-minute window) required before binding/rotating a public key; rotation requires a signature from the *currently active* key, not just re-registration | `E-002` — replay, expiry, cross-installation claims, and hijacking an already-registered ID are all rejected (16 tests) |
| L-7 | Entitlement signing key compromised | Distinct key from the repository key (compromising one doesn't forge the other) | [ADR-0006](./adr/0006-licensing.md), [secrets-inventory.md](../operations/secrets-inventory.md) |

**Residual risk**: ~~L-7's rotation procedure is undrilled... E-002/E-005's proof-of-possession and outage-grace logic are unit-tested against mocked transactions only.~~ **Both closed 2026-08-29** — L-7's rotation now has a live drill (see workflow 2's residual risk above), and E-002/E-005's full challenge/register/rotate/cache flow is live-verified against two real PostgreSQL 16 databases with the marketplace's real Express app and the school's real registration/entitlement-cache service classes making real signed HTTP calls (`apps/marketplace-api/scripts/identity-registration-entitlement-live-drill.js`, wired into `.github/workflows/phase-e-commerce-certification.yml`; [evidence](../acceptance/gate-e-identity-registration-entitlement-live-drill-2026-08-29.md)) — not mocked transactions. **Sign-off**: _pending SEC review_.

## 4. Marketplace (identity, publisher governance, catalog)

| # | Abuse case | Mitigation | Evidence |
|---|---|---|---|
| M-1 | Brute-force or credential-stuff a customer account | Scrypt password hashing; exponential lockout after repeated failures | `E-001` — 31 passing tests |
| M-2 | Steal a session token from a database dump or a log | Session tokens hashed at rest (`MarketplaceSession.tokenHash`). The school API's own `RefreshToken.token` had the same plaintext gap, but is now also hashed at rest with rotation and reuse-detection — the asymmetry this row used to flag no longer exists | `E-001`; [gate-security-refresh-token-custody-2026-08-29.md](../acceptance/gate-security-refresh-token-custody-2026-08-29.md) |
| M-3 | Reuse an already-rotated session token after a legitimate rotation | Reuse-detection: presenting an already-rotated token revokes **every** session on the account | `E-001` — tested |
| M-4 | Steal a customer's TOTP MFA shared secret | **Mitigated** — `MarketplaceAccount.mfaSecret` is encrypted at rest (AES-256-GCM via `IDENTITY_ENCRYPTION_KEYS_JSON`, `encryptSecret`/`decryptSecret` in `identity.service.ts`), with self-healing key rotation live-verified end to end | [secret-rotation-runbooks.md](../operations/secret-rotation-runbooks.md) |
| M-5 | A single compromised admin credential grants unlimited administrative action; a shared token also lets its holder impersonate any specific reviewer/approver | `MARKETPLACE_ADMIN_TOKEN` is still one shared bearer token for `/admin/v1/*` (rotation is now overlap-capable and live-drilled), so a leak still grants broad admin reach — that part remains open. But the more serious half is fixed: every governance action that claims to act as a *specific* person (`reviewerId`/`approvedBy`/`verifiedBy`/`paidBy`) previously took that identity as a self-asserted body field with nothing but the shared token authenticating the caller, letting a token holder forge the two-distinct-reviewer/no-self-review guarantees by simply naming different real people. Those routes now require a real authenticated session and derive the identity from it, ignoring the body — live-verified with two real registered accounts (11/11 checks: forged claims silently corrected to the real caller, self-review still rejected, a HIGH-risk submission only reaches `APPROVED` once two genuinely distinct sessions approved it) | [secrets-inventory.md](../operations/secrets-inventory.md), [secret-rotation-runbooks.md](../operations/secret-rotation-runbooks.md), `apps/marketplace-api/scripts/governance-identity-forgery-live-drill.js` |
| M-6 | A publisher's signing key is stolen and used to publish a malicious release under their trusted identity | Dual-controlled key enrollment/rotation/revocation; MFA-backed role membership; two-reviewer organization identity verification | `F-002` |
| M-7 | A submitted plugin package contains malware, embedded secrets, or a known-vulnerable dependency | Automated analysis: signature/manifest/checksum/dependency/license verification, malware and secret-signal scanning, dependency-advisory checks, structured retained report | `F-003` |
| M-8 | A reviewer approves their own (or a colluding) submission to bypass review | Durable enforcement of no-self-review; two distinct official approvals required for risky capabilities/destructive migrations; retained evidence | `F-004` |
| M-9 | A malicious/abandoned/disputed/transferred plugin needs a documented incident response | Procedures and a tabletop matrix exist, paired with withdrawal/advisory controls | `F-006` |

**Residual risk**: ~~M-4 and M-5 are real, currently-live gaps... M-2's asymmetry with the school API's plaintext RefreshToken.token requires school-side engineering work.~~ **M-2 and M-4 closed 2026-08-29** (encryption-at-rest and refresh-token hash-at-rest, both cited above with live-drilled evidence). **M-5 substantially closed 2026-08-30**: the more serious half (self-asserted reviewer/approver identity forgeable by any shared-token holder) is fixed — governance/review/approval/payout routes now require a real authenticated session and derive identity from it, live-verified. What remains open, correctly and honestly: `MARKETPLACE_ADMIN_TOKEN` is still one shared credential for the *non*-personally-attributed admin routes (release/promotion/pilot-metrics/etc.), so a leak there still grants broad reach; moving those specific routes to per-admin scoped credentials too is real, not-yet-started engineering. **Sign-off**: _pending SEC review; the remaining shared-token routes should be prioritized before Gate E1_.

## 5. Payments

| # | Abuse case | Mitigation | Evidence |
|---|---|---|---|
| P-1 | Client-side "success" redirect used to mark an order paid without a real payment | Rejected by design — only a verified provider event or an authorized manual settlement can mark an order paid | §11.3 invariant; `E-007`/`E-008` |
| P-2 | Replay a webhook event to double-fulfill an order | Unique provider/event key; idempotent, transactional processing | `E-008` — replay/duplicate/out-of-order/retry tested |
| P-3 | Forge a webhook payload without the provider's signature | Authenticity verified before processing | `E-008` — tested |
| P-4 | Manipulate a price client-side before checkout | Order totals computed server-side from versioned price records | §11.3 invariant |
| P-5 | Submit a duplicate refund request to drain funds twice | Idempotent refund with retry-safe behavior; append-only ledger | `E-009` — 22/22 live-verified checks including "admin refund + idempotent retry" |
| P-6 | A dispute is opened after a plugin was already delivered offline; can the token be silently killed to claw back access instantly? | By design, no — a refund/dispute stops *future* refreshes/downloads; it does not retroactively kill an already-delivered offline token (immediate kill requires the distinct D-006 security-advisory path) | `E-010` — documented as a deliberate design property, not a gap |
| P-7 | A raw webhook payload (containing card/payment-processor metadata) is exfiltrated from the database | Payload is retained for audit/dispute evidence by design (§11.3), classified Tier 3 with third-party-exposure flag | [data-classification.md](./data-classification.md) — `PaymentWebhookEvent.rawPayload` flagged as the highest-risk Commerce field |

**Residual risk**: **P-6 is an intentional design tradeoff, not a defect** — a compromised or fraudulent purchase that's already been delivered offline retains access until the distinct advisory/emergency-disable path is invoked; this should be communicated clearly in customer-facing dispute/refund policy so it isn't discovered as a surprise ([refund-policy-v1.0.md](../policies/refund-policy-v1.0.md)). **P-7** means a database compromise exposes real provider transaction metadata, not just Wattanam-internal data — this is an inherent cost of retaining raw payloads for dispute evidence, not something a code change removes. **Sign-off**: _pending SEC and FL review of P-6's customer communication; provider selection for DEC-009's second adapter still open_.

## 6. Publisher

| # | Abuse case | Mitigation | Evidence |
|---|---|---|---|
| Pu-1 | An anonymous or unverified party submits a plugin | Publisher organization membership and identity verification required before submission; controlled publishing keeps this invited-only through the F pilot | `F-002`, DEC-007 |
| Pu-2 | A submitted plugin's backend code does something outside its declared capabilities (the architectural limit of the trust model) | **Not fully mitigated at runtime — this is the plugin trust model's known, accepted boundary** | [ADR-0004](./adr/0004-plugin-trust.md); [security-review-checklist.md](../plugins/security-review-checklist.md) — "review-before-signing covers what no test can" |
| Pu-3 | A publisher disputes revenue/payout figures | Append-only ledger; exact statements; tax/fee totals; order-to-statement-to-payout reconciliation balances exactly; corrections append entries and require dual approval | `F-009` |
| Pu-4 | A publisher's support/refund obligations are unclear, leading to a support-burden dispute | Versioned publisher agreement and revenue/refund/support policy published | [publisher-revenue-refund-support-v1.0.md](../policies/publisher-revenue-refund-support-v1.0.md) (F-001, approval pending) |
| Pu-5 | A destructive plugin migration is submitted (e.g. `DROP TABLE` on a namespaced table) disguised as a routine update | Migration-risk preview shown to reviewers; two distinct official approvals required for destructive migrations | `F-004` |

**Residual risk**: **Pu-2 is the single largest residual risk in this entire threat model** — it is not a bug to be fixed but the direct, accepted consequence of choosing reviewed-signed-in-process trust over sandboxing ([ADR-0004](./adr/0004-plugin-trust.md)). The compensating controls (F-002 dual-control key custody, F-003 automated scanning, F-004 two-person review, D-006 emergency disable) reduce the *likelihood* a malicious plugin reaches production and shrink the *time-to-detect/respond* if one does, but none of them can prevent a sufficiently subtle malicious plugin — approved by two reviewers who missed something — from having full in-process runtime privilege once signed. **Sign-off**: _pending SEC review; this residual risk should be explicitly accepted (not silently inherited) by the Product Owner as part of DEC-011's acceptance, since it's a direct consequence of that decision_.

## Cross-cutting threats not tied to one workflow

- **Insider/credential-leak risk** across every shared secret without a rotation runbook — `JWT_SECRET`, `MARKETPLACE_ADMIN_TOKEN`, `PAYMENT_WEBHOOK_SECRET` all rotate by "change the env var and hope nothing breaks" today (full list: [secrets-inventory.md](../operations/secrets-inventory.md)).
- **Future telemetry** (DEC-012, [ADR-0008](./adr/0008-telemetry.md)) does not exist yet, but is threat-modeled here proactively: an opt-in telemetry ingestion endpoint is a new externally-reachable surface, and a compromised or misconfigured one is a threat that must be designed against *before* the first line of telemetry code ships, not audited afterward.
- **Freeform text fields** (`notes`, `reason`, `description` columns across both schemas) are an unbounded content risk independent of any single workflow — flagged in [data-classification.md](./data-classification.md), not re-derived here.

## Residual-risk sign-off

| Workflow | Highest residual risk | Sign-off (name, date) |
|---|---|---|
| Installation | Real-legacy-data adoption unrehearsed | _pending_ |
| Update | ~~Entitlement key rotation undrilled~~ Closed 2026-08-29 (live-drilled) | _pending SEC review_ |
| Licensing | ~~Same undrilled rotation; live-DB verification open~~ Closed 2026-08-29 (both live-drilled) | _pending SEC review_ |
| Marketplace | Shared admin token still covers non-personal ops routes (the reviewer/approver impersonation half is closed 2026-08-30; mfaSecret encryption and rotation closed 2026-08-29) | _pending_ |
| Payments | P-6 design tradeoff needs customer communication | _pending_ |
| Publisher | In-process trust model's architectural ceiling (Pu-2) | _pending — recommend explicit PO acceptance alongside DEC-011_ |

No row in this table may be silently closed — each is either fixed with an engineering change (rechecked against this document) or formally accepted as residual risk by the named Security approver, matching the ADR acceptance format in [adr/README.md](./adr/README.md).
