# WordPress-style completion goals

Started: 2026-11-05
Scope: Wattanam-V2 (marketplace, platform-admin, plugins, SDK) and Wattaman-customer-school (school core).
Source plan: `Wattaman-customer-school/docs/architecture/wordpress-style-core-plugin-reform-plan.md`.

Goal: a new school can start from a lean core, connect to the marketplace, and install, pay for,
update, disable, remove and restore plugins, with no school-business code left in core.

Status key: `[ ]` not started · `[~]` in progress · `[x]` done with evidence linked.

## G1 — Local end-to-end run (both stacks on one Docker host)

Prove the new-school scenario (reform plan §12) on a local machine before paying for any hosting.

- [x] Marketplace stack up (`npm run local:up`): API on :3010 ready, Platform Admin on :3020.
- [x] Publisher `wattanam` registered with local key `local-official-plugins`
      (`.local-secrets/plugin-signing-private.pem`). All 14 plugins checked, signed and published
      as free BETA. Local only: the release certification suite was skipped.
- [x] School core stack built from source (`Dockerfile.core` ×2 + gateway) and reachable on :3000.
      School repo: `docker-compose.local.yml` override + `scripts/bootstrap-local-connected.js`.
      Gateway `/` is HTML, `/setup` is 200, `/api/health` is ok.
- [x] Local connection path (school API container reaches `host.docker.internal:3010/health/ready`): school API runs `NODE_ENV=development` only in the local override, so
      `MARKETPLACE_URL=http://host.docker.internal:3010` is allowed. No code change; production
      still rejects non-HTTPS. School gets only public keys (repository, entitlement, publisher).
- [ ] Owner setup + MFA; dashboard shows only core actions.
- [ ] Claim/link the school to a marketplace account.
- [ ] Install Academic Management, then Attendance Manager (dependency order).
- [ ] Install one free plugin and buy one paid plugin (manual settlement is fine locally).
- [ ] Licence renewal, grace period, suspension, recovery.
- [ ] Disable → update → uninstall → reinstall, with data kept.
- [ ] Back up, restore into the recovery-drill profile, reconcile plugin data.
- [ ] Write the result to `architecture/acceptance/local-e2e-<date>.md`, listing each gap found as a new task below.

## G2 — Free plugins and a public store

- [ ] Decide which plugins are free (all manifests currently say `commercial`).
- [ ] Free install path: free licence issued without an order.
- [ ] New app `apps/marketplace-web`: public catalog, plugin pages, customer account, link approval.
- [ ] Move publisher and reviewer pages out of the school frontend (`frontend/app/marketplace/*`) into that app.

## G3 — Plugin UI and plugin directory cleanup

- [ ] Replace hard-coded school pages `frontend/app/plugins/wattanam.academic-management` and `wattanam.timetable` with the SDK's declarative UI.
- [ ] Add `organizing-management` to the official directory, or fold it into another plugin.
- [ ] Settle `announcements` vs `communication`: one owns announcements.

## G4 — Remove legacy business code from the school

Only after each existing school is moved to plugins (reform plan §8 and §13).

- [ ] Inventory existing schools still on `legacy-full`.
- [ ] Per module, delete the backend module, admin pages and tables once its plugin owns them:
      attendance, study-years, holidays, classes, class-registrations, courses, assignments, exam,
      scoring, timetable, fees, salary, staff-cv, bus, announcements, posts, card-*, reports, parent.
- [ ] Delete the legacy card designer (`frontend/app/admin/card-designer`, `components/card-designer`)
      and drop `@imgly/background-removal`. Its nested zod 3.25 has an unpatched high advisory
      (GHSA-mrhx-c7xc-m3w5); it is not in the core image, so CI reports it without blocking.
      First check whether Document Designer needs background removal; if so, that becomes a plugin task.
- [ ] Remove the `legacy-full` distribution flag.

## G5 — Third-party plugin runtime (optional; needed only for outside publishers)

- [ ] Implement ADR-0009 isolated runtime for third-party backend code.
- [ ] Publisher onboarding, review queue and SLA policy.

## G6 — Production hosting

- [ ] Rotate the two marketplace signing keys exposed on 2026-09-10.
- [ ] External object storage, managed signing keys (KMS/HSM), transactional email.
- [ ] TLS, DNS, backups, monitoring, restore drill on the chosen host.
- [ ] Rename `railwayProjectId` to `hostingProjectId` (backward-compatible).
- [ ] Run G1's scenario again on the production-shaped host.

## Log

- 2026-11-05 — Goals created. G1 started.
- 2026-11-05 — Local marketplace running; 14 plugins published as free beta. First build
  attempt hit an npm network reset (ECONNRESET); a retry passed.
- 2026-11-06 — Paused the scheduled workflows that target deleted hosts. Patched high backend and
  frontend advisories. The core web image now ships only traced dependencies (802 MB → 50 MB
  node_modules), and the blocking CI audit covers exactly what the core image ships.
- 2026-11-06 — Found the live Railway hosts (`wattanam-v2`, `customer-school`, recreated 2026-10-26).
  Released signed core 0.1.16 (commit 1cfaec1) and deployed it to `customer-school`: plan was
  0 add / 4 image changes / 0 destroy. The live school (Angkor School) passes the same page, asset
  and health checks as before, with no pending migrations. Rollback = re-apply the 0.1.15 digests.
  `APP_VERSION` stays at 0.1.14 (as in the 0.1.15 deploy); fixing the version bookkeeping is open.
  Live catalog has only Academic Management and Organizing Management; the other 12 plugins are
  unpublished (G2 decision).
- 2026-11-06 — Security review. Deployed school core 0.1.17 (commit 4223bc4; plan 0 add / 5 change /
  0 destroy):
  - The login rate limit was shared by the whole school (5 per minute for every user combined).
    It now counts per real client via `TRUST_PROXY_HOPS=2` (Railway edge + gateway).
  - Audit-log IPs can no longer be spoofed through X-Forwarded-For.
  - API, worker and web now listen on both IPv4 and IPv6. Gateway connection failures went from
    about 20 per 20 minutes to 0.
  - The gateway now sends HSTS, nosniff, X-Frame-Options and Permissions-Policy, and no longer
    sends X-Powered-By.
  Marketplace 0.1.2 (zod 4, body-parser/multer patches, partial-update default bug fixed) is built
  and signed but not deployed yet. Still open: remove public api/web/worker domains, branch
  protection, CSP with a report endpoint, KMS for signing keys.
- 2026-11-06 — Deployed marketplace 0.1.2 (commit 71e9d25; plan 0/2/0; no new migrations). Health,
  admin and catalog match the baseline, validation errors come back as structured 400s, and
  school→marketplace calls keep working. Removed the hand-added public domains on school
  api/web/worker, so the gateway is now the only ingress (the direct URLs return 404, the gateway
  still returns 200, and there are no 5xx responses or errors). Removed a stray local Railway link
  from `apps/marketplace-api` to the unrelated project "Seong Kimseng".
  Still open: branch protection on `main` (both repos), CSP with a report endpoint, KMS for signing
  keys, re-enabling the two paused scheduled workflows, APP_VERSION bookkeeping.
- 2026-11-06 — Protected `main` in both repos:
  - Changes go through pull requests; 0 approvals required, so a solo maintainer can merge.
  - Every pr-validation job must pass, on a branch that is up to date with `main`.
  - The rules apply to admins too.
  - No force-pushes or deletion of `main`.
  Releases still run by workflow_dispatch on `main`.
- 2026-11-06 — Monitoring and backups:
  - Catalog verification re-enabled; its first run passed (15 releases, signatures and digests).
  - School core 0.1.18 deployed (plan 0/4/0): nightly recovery sets are now encrypted (AES-256-GCM)
    and copied to Cloudflare R2 bucket `wattanam-angkor-school-backups`.
  - Restore tool `fetch-offsite-backup.js` ships in the image; runbook in
    `docs/operations/offsite-backups.md`. Verified on a real S3 API: identical bytes, wrong key rejected.
  - New `Backup freshness` monitor fails above 26h. Its first run correctly reported "no off-site
    set yet"; the first set lands at 02:00 UTC.
  - Scheduled recovery drill now installs the official Railway CLI. It still needs the
    `RAILWAY_TOKEN` secret and a `recovery-drill` rehearsal database (user decision).
- 2026-11-06 — Core 0.1.19: report-only Content-Security-Policy at the gateway, with a minimized
  `/api/csp-report` endpoint. A real Chromium run and the first real-user reports show only Next.js
  inline scripts as violations; Google Fonts (Khmer) are allowed. Next: collect reports from
  logged-in traffic, then phase 2 (per-request nonces, then switch to enforcing).
