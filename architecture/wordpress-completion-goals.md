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
