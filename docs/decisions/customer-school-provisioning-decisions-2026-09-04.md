# Customer School Provisioning and Control Decisions

Status: **approved**
Decision date: 2026-09-04
Applies to: `docs/marketplace/customer-school-provisioning-control-plan.md` §19, which blocks
implementation until these seven decisions are recorded

These record the decisions the provisioning plan requires before any code or production mutation.
Weakening two-person approval, the data boundary, or the school administrator's plugin authority
requires a superseding reviewed decision.

## D-1 — One canonical production marketplace database

Platform Admin and the public marketplace share a single production marketplace database and a
single canonical marketplace API, reached over Railway private networking. Operating separate
databases for the two was already producing the failure this decision closes: a school registered
against one marketplace was structurally invisible to a console reading the other.

**Executed 2026-09-04.** `platform-admin-web` now runs in the `Wattanam V2 Marketplace` project
(`b828cc9c-57aa-46c1-8ff7-1836773f1cfa`) alongside `marketplace-api`, and reaches it privately at
`marketplace-api.railway.internal:8080`. The former `Wattanam Platform Admin Staging` project
remains the staging control plane, with its own database, signing keys, operators, and schools.

Note for anyone repointing a school: both deployments publish the key id `metadata-2026-08-31`
while holding **different** keys. A repoint that updates `MARKETPLACE_URL` but not
`UPDATE_REPOSITORY_PUBLIC_KEY` therefore fails as "signature invalid" rather than "unknown key".

## D-2 — Platform-first provisioning is the normal path

Creating a school starts in Platform Admin: directory record, approval, provisioning, installation,
enrollment. Railway-first adoption exists for schools deployed before that automation, and is a
migration path rather than a second supported way to onboard.

## D-3 — Infrastructure creation requires two-person approval

Creating paid infrastructure, restoring into production, rotating credentials, replacing a custom
domain, and decommissioning each require a second named MFA-verified operator who is not the
requester. This reuses the mechanism already proven for exceptional entitlements, including its
database-level constraint that the decider differs from the initiator.

## D-4 — The control plane holds metadata and signed operations only

Platform Admin stores commercial, deployment, marketplace, and health metadata. It never reads
students, grades, attendance, fees, messages, or school files; never retrieves owner passwords, JWT
secrets, private keys, or provider credentials; never impersonates a school user; and never
executes arbitrary commands in a school container. A school is acted on through signed, expiring,
narrowly scoped operations, not shared database credentials or a remote super-admin password.

## D-5 — The school administrator keeps plugin authority

A platform operator may approve acquisition and issue an entitlement. Installing or activating a
plugin inside a school remains the local `SUPER_ADMIN`'s decision, and no control-plane action may
substitute for it.

## D-6 — Railway credentials are scoped worker credentials

The Railway token lives only in the provisioning worker's environment, scoped to the approved
workspace, with separate production and staging credentials. It is never a personal CLI session and
never reaches the API process or an operator's browser.

## D-7 — First implementation target

Adoption of the existing Angkor1 International School project
(`b5b07c38-6569-4bee-ab88-6b134998c77d`), followed by one disposable Platform-first school. Until
that adoption passes its hosted drill, Platform-first provisioning stays behind its approval gate.

## Deviations recorded at the time of writing

- The plan's §3 baseline lists the Platform Admin school list, create form, and detail view as
  implemented; they are (commit `b9cd88f`), but the create form does not yet collect the Railway
  project id or gateway origin that §16 Phase 1 requires, and `railwayProjectId` carries no
  uniqueness constraint despite §5 requiring one project to belong to at most one school.
- `POST /v1/installations/register` still requires a caller-supplied `accountId` for an account
  that must already exist, even when a valid enrollment token is presented. On a marketplace with
  no customer accounts this makes enrollment impossible, so adoption of an unregistered school
  currently depends on a customer account existing first.
