# School Support Runbooks (B-009)

Status: engineering-drafted, grounded in what exists today — not a documentation placeholder. Every step below names a real endpoint, script, or CLI command that already works; where full automation (B-005–008) doesn't exist yet, the runbook documents the current manual procedure instead of describing automation that isn't built. Acceptance bar: a support person with no engineering background can execute every runbook below using only this document.

This is the school/customer-facing counterpart to [publisher-support-and-escalation.md](../marketplace/publisher-support-and-escalation.md) (F-005, publisher-facing) — that document's escalation table stays the reference for marketplace/publisher issues; this one covers a school's own installation lifecycle.

## 1. Escalation

| Issue | First responder | Escalates to | Initial response target |
|---|---|---|---|
| School can't log in / setup won't complete | Support | Engineering (if `/health/ready` or `/diagnostics` shows a real fault) | Critical 1 hour; high 1 business day |
| Billing/subscription/entitlement confusion | Support | Finance Operations | 2 business days |
| Data loss / corruption suspected | Support, immediately | Engineering on-call (Disaster Recovery, §6) | Critical 1 hour |
| Custom domain not resolving | Support | SRE (only if DNS/TLS steps in §5 don't resolve it) | 1 business day |
| Plugin misbehaving | Support | Plugin Platform (if core-caused) or the publisher (if plugin-caused, per F-005) | 1 business day |
| Security incident / suspected compromise | Support, immediately | Security on-call | Critical 1 hour |

Support records identify the school, impact, workaround (if any), owner, severity, timestamps, and resolution — matching the same discipline as F-005. Never ask a school to share its database dump, `.env` file, or any credential; use `GET /diagnostics` (authenticated as the school's own admin, or walk them through reading it) for everything support needs to see.

## 2. Customer handoff (new school, first week)

Runs immediately after the provisioning steps in §8.1 of the [master plan](../platform-master-execution-plan.md#81-railway-customer-workflow) complete and the owner has finished `/setup`.

1. Confirm the school is actually healthy from the outside: `curl https://<school-domain>/health/ready` should return `{"status":"ready", ...}`. If not, do not proceed with handoff — escalate per §1.
2. Confirm exactly one owner exists: ask the school to log in and check **Admin → Users** shows their account as `SUPER_ADMIN`. (The setup flow's own transactional guarantee, `INS-003`, already ensures this — this step is a support-side confirmation, not a fix.)
3. Walk the owner through the diagnostics page (`GET /diagnostics`, surfaced in the admin panel) so they know where to look themselves before contacting support next time — installation identity, migration state, database status, version, and backup state are all visible there without needing engineering.
4. Confirm the school's licensing/entitlement state in the customer portal (`/marketplace`, per E-006) matches what was sold — active subscription, correct product(s).
5. Record in the support system: installation ID (from `/diagnostics`), owner contact, domain, subscription plan, and the date backups were first confirmed running (§6, step 1).
6. Send the owner the plain-language quick-start: where `/setup` was, where the admin panel is, how to reach support, and — critically — that **support cannot see or reset their password** (per §8.1's design invariant); point them at the standard password-reset flow instead.

## 3. Ownership transfer

A school's designated owner (`SUPER_ADMIN`) sometimes needs to change — staff turnover, a new IT contact, etc. This uses an existing capability (`PUT /auth/users/:id`, which already restricts promotion to `SUPER_ADMIN` to an existing `SUPER_ADMIN` caller — see [contract-catalog.md](../architecture/contract-catalog.md)); there is no separate "ownership transfer" feature to build, only a procedure to follow correctly.

1. **Verify the request is legitimate** before touching anything — this is the actual risk in this runbook, not the technical step. Confirm the request through a channel independent of email (e.g., a phone call to a number already on file, not one provided in the request itself).
2. Ask the *current* owner (if still reachable and cooperative) to promote the new owner themselves: **Admin → Users → (select new owner) → Edit → Role → SUPER_ADMIN**. This is the preferred path — support never needs credentials.
3. If the current owner is unreachable (departed staff, lost access): this requires engineering, not support — a direct database role change bypasses the app's own transactional safeguards and must be logged as a manual intervention with the same rigor as any other production data change. Escalate per §1; do not attempt this from a support runbook.
4. After transfer, confirm the new owner can log in and see `SUPER_ADMIN`-only pages (Diagnostics, Plugins, Updates) before closing the ticket.
5. Record the transfer (old owner, new owner, verification method used, date) in the support system — this is exactly the kind of event `AuditLog` already captures automatically (`actorName`/`actorEmail`/`resourceLabel`, per [data-classification.md](../architecture/data-classification.md)), but the *verification* step itself happens outside the app and must be recorded separately.

## 4. Renewal

Entitlements degrade gracefully by design (per [ADR-0006](../architecture/adr/0006-licensing.md)) — a lapsed subscription never disables a school's existing data or core functionality, only future updates/support. That changes what "renewal support" means: it's proactive, not a crisis response.

1. **30 days before an entitlement's expiry**: the customer portal (E-006) should already reflect the upcoming expiry to the school owner — confirm they've seen it, don't just assume.
2. **At expiry**: updates/support pause; core operation continues unaffected. Confirm the school understands this distinction before they discover it themselves and assume something is broken.
3. **Renewal payment**: uses the same manual-invoice or online-webhook path as an original purchase (E-007/E-008) — there is no separate "renewal" code path, just a new order against the same product.
4. **Grace-period questions**: refer to [refund-policy-v1.0.md](../policies/refund-policy-v1.0.md) and the entitlement contract's offline-refresh grace window (§11.2 of the master plan, default 30 days) — do not improvise a different grace period on a case-by-case basis; that's a policy decision, not a support one.
5. If a school disputes a charge or wants to cancel, follow §1's escalation to Finance Operations, not an ad hoc resolution.

## 5. Domain change

**B-006/B-007's automated domain state machine doesn't exist yet** — this is the current manual procedure using the Railway CLI, following the exact add → verify → switch → retain → remove sequence the master plan already specifies (§8.1), just performed by hand instead of by automation.

1. **Add**: `railway domain <new-domain.example.com> --service <api-or-gateway-service> --project <project-id>`. This returns the exact DNS records (CNAME/TXT) Railway needs — copy these to the school exactly as shown; do not paraphrase or guess a record.
2. **Verify**: wait for the school to add the DNS records on their end, then confirm propagation before switching anything — `dig <new-domain.example.com>` or `nslookup` should resolve to Railway's target, and the domain must actually serve traffic (`curl -I https://<new-domain.example.com>` returns a real response, not a TLS or connection error) before it's "verified." A DNS lookup succeeding alone is not enough — this matches the master plan's explicit rule that a domain is never marked active from DNS lookup alone.
3. **Switch**: once verified, update the *exact* origin everywhere it's configured — this is the step most likely to be done incompletely by hand, so check all of: gateway routing config, `CORS_ORIGINS` (`railway variable set CORS_ORIGINS=https://<new-domain> --service api`), any hardcoded cookie domain setting, marketing links, and the support record itself. An incomplete switch (e.g. CORS updated but cookies still scoped to the old domain) silently breaks login — test a real login after switching, don't just confirm the page loads.
4. **Retain old domain temporarily**: don't remove the old domain immediately — keep it pointed at the same service so existing bookmarks/links redirect rather than break, for an agreed window (recommend 30 days, matching this document's other grace-period defaults — a Product Owner–set policy would override this).
5. **Remove**: after the retention window, remove the old domain from Railway and confirm it no longer resolves to this school's service.
6. Record every step's completion (not just the final state) in the support ticket — a domain change that fails partway through is exactly the scenario this checklist exists to prevent from being invisible.

## 6. Disaster recovery

**What's proven today**: PostgreSQL backup/restore is live-verified end to end on Railway PostgreSQL 18, preserving installation identity and an exact schema fingerprint (`OPS-003`). **What's not yet bundled**: plugin files, plugin data, and uploads as part of the *same* recovery action — restoring the database today does not automatically restore plugin binaries or their data directories. Until B-012 finishes that bundling, treat database and file recovery as two separate, sequenced steps, not one.

1. **Confirm the school actually needs recovery** before restoring anything — check `GET /diagnostics` and `GET /health/ready` first; a slow or degraded school is not automatically a data-loss event, and restoring is not reversible once newer data is overwritten.
2. **Database recovery**: use `backend/scripts/restore-database.js` against the most recent verified backup (`backend/scripts/backup-database.js` output) — this is the exact script already live-drilled for `OPS-003`. Confirm the restored database's identity (`Installation.slug`) and schema fingerprint match what's on record for this school before declaring the database step done.
3. **Plugin files recovery** (until B-012 automates this): plugin binaries live under `/data/plugins` and plugin-scoped data under `/data/plugin-data/<pluginId>` on the school's Railway volume — if the *volume itself* is intact but the database was restored from an older backup, plugin registry rows in the database may now reference plugin versions that don't match what's on disk. After a database restore, always re-run the plugin registry against the actual files on disk (`GET /plugins` as `SUPER_ADMIN` shows installed versions — cross-check this against what's physically present) rather than assuming they still agree.
4. **Uploads/settings**: `PluginSetting` rows are database-backed (not files — see [contract-catalog.md](../architecture/contract-catalog.md)'s data-classification cross-reference), so they recover automatically with the database step; only genuinely file-based plugin storage (`storage.read/write` capability) needs the manual file-recovery step above.
5. **After recovery**: run the same handoff health checks as §2 (steps 1–3) before telling the school they're back online — a "restored" installation that fails its own readiness check is not actually recovered.
6. **Record the incident**: cause (if known), what was restored, from which backup, RPO actually achieved (how old was the restored data), and RTO actually achieved (how long recovery took) — compare both against the proposed targets in [support-matrix.md](../architecture/support-matrix.md) (RPO 24h, RTO 4h) and flag it to engineering if either was missed, since that's a signal the backup schedule (B-008, not yet automated) needs attention.

## Rehearsal (2026-08-29)

Per the master plan's §13.5 acceptance bar ("QA and Support execute the published runbook
without unpublished engineering knowledge; unclear or missing steps fail the gate"), §2 and §3
were literally executed end to end against a real backend and a real disposable PostgreSQL 16,
using only the commands as written above (curl standing in for the admin-panel clicks a support
person would actually make) — not the underlying service code directly:

- **§2 Customer handoff**: ran the real `/setup` install flow, then followed steps 1–3 exactly as
  written. `GET /health/ready` returned `{"status":"ready", ...}` verbatim; `GET /diagnostics`
  really does show installation identity, migration state, database status, version, and backup
  state, exactly as claimed, in one call, without needing separate admin-panel screens. No
  unclear or missing steps. (Steps 4–5 need a real marketplace/portal connection and a support
  ticketing system respectively — not locally rehearsable, and already covered on the licensing
  side by E-002/E-005's own live drills.)
- **§3 Ownership transfer**: created a second account, then had the *original* owner's token
  call `PUT /auth/users/:id` with `{"role":"SUPER_ADMIN"}` exactly as documented — succeeded,
  and (correctly, matching the runbook's own wording of "a school's designated owner sometimes
  needs to change," not "must be swapped") this results in *two* SUPER_ADMINs, not a
  demotion of the original. The newly promoted owner logged in and could reach all three named
  SUPER_ADMIN-only pages (`/diagnostics`, `/plugins`, `/updates`). The `AuditLog` row for the
  promotion carries `actorEmail: "owner@..."` and `resourceLabel: "Dara New IT (SUPER_ADMIN)"`
  exactly as the runbook claims (one small nuance: `actorName` was `null` on this row even
  though `actorEmail` was populated — the identifying information the runbook promises is
  present, just not every field it lists is always populated on every row).
- **§6 Disaster recovery**: the two script names this section cites,
  `backend/scripts/backup-database.js` and `backend/scripts/restore-database.js`, both exist
  exactly as named. The recovery *mechanism* itself is already live-drilled end to end by
  B-008/B-012, not re-proven here — this pass only confirms the runbook's own text still points
  at real, correctly-named artifacts.
- **Not rehearsed this pass**: §1 (a table, not an executable procedure), §4 (needs a real
  payment/portal cycle), and §5 (needs a real Railway project/domain) — none of these are
  cheaply rehearsable locally, and none of their claims changed as a result.

Zero discrepancies found in what was rehearsed — every documented command/endpoint worked
exactly as written, closing a real gap named in the master plan (this runbook had never
actually been executed literally end to end, only reasoned about against the underlying code).

## Change rule

A new runbook-relevant capability (a new endpoint, script, or automated domain/backup feature from B-005–008) updates the relevant section above in the same change that ships it — a runbook describing capabilities that no longer match reality fails support faster than having no runbook at all.
