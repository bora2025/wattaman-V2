# Customer School Provisioning and Platform Control Plan

Status: implementation in progress — Phases 1–2 complete in code; Phase 3 control-plane foundation complete

Owner: Wattanam Platform

Last reviewed: 2026-09-05

Scope: Railway-managed customer schools and the central Platform Admin control plane

## 1. Goal

Allow an authorized platform operator to create or adopt a customer school, connect its isolated
Railway project to the central marketplace, and monitor its lifecycle from Platform Admin without
giving the control plane access to the school's operational data.

The finished workflow must support both:

1. **Platform-first provisioning (recommended):** create the school record in Platform Admin,
   approve provisioning, create the Railway project, install the school, and redeem a one-time
   enrollment token.
2. **Railway-first adoption:** discover or enter an existing Railway project, validate its public
   identity, create the matching Platform Admin record, and securely register/adopt its
   installation.

## 2. Non-negotiable boundaries

- One customer school equals one Railway project and one PostgreSQL database.
- Platform Admin stores commercial, deployment, marketplace, and health metadata only.
- Platform Admin never reads students, grades, attendance, fees, messages, or school files.
- A Railway project ID is infrastructure metadata; it is not proof of school ownership.
- A school is controlled through signed installation identity and narrowly scoped commands, not
  shared database credentials or a remote super-admin password.
- Platform operators may provision and suspend marketplace access, but cannot silently install or
  activate plugins inside a school. The local school administrator retains that decision.
- Plaintext enrollment tokens and private keys are never stored in the marketplace database.
- Every mutation requires an operator, permission, reason, correlation ID, and audit event.

## 3. Current implementation baseline

Already implemented:

- `CustomerSchool` directory model with Railway project ID and gateway origin.
- Lifecycle states: `PROSPECT`, `AWAITING_CLAIM`, `ACTIVE`, `SUSPENDED`, `TERMINATED`.
- Platform Admin school list, creation form, school detail, and permission-filtered navigation.
- `schools.read` and `schools.manage` authorization.
- One-time, hashed, expiring enrollment tokens.
- Installation challenge, signed registration, key rotation, and marketplace linking.
- Adoption of a previously registered installation.
- Railway per-school provisioning script with one-school-per-project validation.
- Audit records for school creation, changes, token issuance/revocation, and adoption.

Implemented on 2026-09-05:

- canonical Railway service/build contracts and a CI validator;
- duplicate Railway project/gateway prevention and SSRF-safe adoption discovery;
- durable provisioning request and attempt records with an explicit state-transition service;
- payload-bound idempotency, same-request transactional locking, expiring second-operator
  approval, retry/cancel behavior, sanitized failures, and audit events;
- Platform Admin provisioning creation, status list, approval, cancellation, and retry controls;
- allowlisted Platform Admin proxy routes and OpenAPI contracts for the provisioning workflow.

Remaining gaps:

- Creating a Railway project does not create a Platform Admin school record.
- The approved provisioning worker and Railway adapter are not yet deployed.
- Provisioning does not yet expose its full checkpoint timeline in Platform Admin.
- There is no reconciliation scheduler.
- Existing Railway projects are not automatically matched to directory records.
- Installation registration still requires operator-run setup steps.
- Platform Admin has no consolidated deployment, DNS, backup, upgrade, or agent-heartbeat view.
- There is no remote-command approval and acknowledgement protocol.

## 4. Recommended ownership model

Use one central production control plane:

```text
Wattanam Marketplace Production
├── marketplace-api
├── platform-admin-web
├── marketplace PostgreSQL
├── provisioning worker
└── provisioning audit/artifact storage

Wattanam - <Customer School> - Production
├── api
├── web
├── gateway
├── PostgreSQL
└── persistent API volume
```

Do not operate separate marketplace databases for the public marketplace and Platform Admin in
production. Platform Admin should call the same canonical marketplace API over Railway private
networking. Staging remains isolated with its own database, signing keys, operators, and schools.

## 5. Source of truth and identifiers

| Identifier | Source of truth | Purpose |
|---|---|---|
| `CustomerSchool.id` | Marketplace database | Internal directory identity |
| school slug | Marketplace database | Human-safe immutable business identifier |
| Railway project ID | Railway | Infrastructure identity |
| installation ID | School database | Cryptographic installation identity |
| gateway origin | Railway/domain provider | Public school entry point |
| installation public key fingerprint | Marketplace database | Proof of installation identity |
| customer account ID | Marketplace database | Commercial ownership |

Uniqueness rules:

- school slug is globally unique;
- Railway project ID belongs to at most one customer school;
- installation ID belongs to at most one customer school;
- a customer school has at most one active installation;
- retries reuse an idempotency key and cannot create a second project.

## 6. Lifecycle state machine

Use separate commercial and provisioning states. Do not overload one field with both meanings.

### 6.1 Commercial lifecycle

```text
PROSPECT → AWAITING_CLAIM → ACTIVE → SUSPENDED → ACTIVE
                                  └────────────→ TERMINATED
```

### 6.2 Provisioning lifecycle

```text
DRAFT
  → PENDING_APPROVAL
  → APPROVED
  → PROVISIONING
  → DEPLOYED
  → INSTALLATION_PENDING
  → REGISTRATION_PENDING
  → VERIFYING
  → READY

Any running state → FAILED_RETRYABLE → previous safe step
Any pre-ready state → CANCELLED
READY → DEGRADED → READY
READY → DECOMMISSION_PENDING → DECOMMISSIONED
```

Each transition records timestamps, actor, attempt number, sanitized error code, and the last
successful checkpoint. A retry resumes after that checkpoint instead of creating new resources.

## 7. Flow A — Platform-first provisioning (recommended)

### Stage A1: Create the customer school

Marketplace Operator opens **Customer schools → Create** and enters:

- legal school name and immutable slug;
- customer/contact identity;
- plan, billing region, locale, timezone, and currency;
- target Railway workspace/environment/region;
- requested canonical or custom domain;
- internal business reason.

Result: `CustomerSchool(PROPECT)` plus a `SchoolProvisioningRequest(DRAFT)`. No Railway resources
exist yet.

### Stage A2: Validate and approve

Preflight validates:

- slug and project name are available;
- customer/contact policy is satisfied;
- selected release contains immutable image digests;
- required marketplace public keys and URLs are available;
- Railway credential can access only the approved workspace;
- quota and expected monthly cost fit policy;
- domain is not already attached elsewhere.

Creating paid infrastructure requires a second operator approval. The requester cannot approve
their own request. Approval expires after a configured period.

### Stage A3: Provision Railway

The worker uses a narrowly scoped Railway token from its secret store to create:

1. project `Wattanam - <School> - Production`;
2. PostgreSQL service and volume;
3. API, web, and gateway services from digest-pinned images;
4. API persistent volume;
5. private service networking;
6. a public gateway domain only;
7. service variables and unique generated secrets;
8. deployment health checks and restart policies.

The worker stores resource IDs and sanitized results. It never stores generated secret values in
job logs or audit metadata.

### Stage A4: Install the school

After all three services are healthy:

- mint a short-lived one-time enrollment token;
- send it directly to the new school API through a protected provisioning channel;
- run the unattended installer with school name, slug, locale, timezone, currency, and owner
  bootstrap material;
- generate the installation key pair on the school's persistent volume;
- register the installation with the canonical marketplace API;
- consume the enrollment token atomically.

Result: the directory record becomes `ACTIVE`; provisioning becomes `VERIFYING`.

### Stage A5: Verify and hand over

Verify:

- gateway TLS and expected content;
- API liveness/readiness and database access;
- installation ID and public-key fingerprint match the registration;
- marketplace link works;
- API restart preserves installation identity;
- backup succeeds and its manifest is readable;
- school owner can complete login/MFA/password rotation;
- no internal service has a public domain.

Only after all checks pass does provisioning become `READY`.

## 8. Flow B — Railway-first adoption

Use this for project `b5b07c38-6569-4bee-ab88-6b134998c77d` and other schools created before
automated provisioning exists.

### Stage B1: Enter the Railway project

Marketplace Operator chooses **Adopt existing Railway school** and supplies:

- Railway project ID;
- environment (`production` by default);
- gateway origin;
- internal migration reason.

The control plane fetches Railway metadata with read-only access and confirms the project is in the
approved workspace.

### Stage B2: Validate the public school identity

Call only public, non-sensitive endpoints:

- `/api/version`;
- `/api/health/ready`;
- `/api/installation/status`.

Display the detected school name, slug, installation ID, core version, locale, timezone, currency,
and gateway domain. The operator must explicitly confirm the match.

For the current demo project, the detected values are:

| Field | Detected value |
|---|---|
| Railway project ID | `b5b07c38-6569-4bee-ab88-6b134998c77d` |
| Gateway | `https://gateway-production-26d3.up.railway.app` |
| School | Angkor1 International School |
| Slug | `angkor1-international-school` |
| Installation ID | `151bc256-fc6f-41f2-b249-6241ded37a6e` |
| Core version | `1.0.0` |
| Locale/timezone/currency | `en-KH` / `Asia/Phnom_Penh` / `KHR` |

### Stage B3: Create or match the directory record

- If no slug, Railway project ID, or installation ID matches, create a `PROSPECT` record.
- If exactly one safe match exists, show a field-by-field comparison and update only after
  confirmation.
- If identifiers point to different schools, stop with a conflict; never guess or merge.
- Record the source project, detected installation metadata, operator, and migration reason.

### Stage B4: Establish marketplace registration

There are two safe cases:

1. **Installation already registered:** use the existing `adopt-installation` operation after
   confirming it is unassigned.
2. **Installation not registered:** mint a one-time enrollment token, configure the school with the
   canonical `MARKETPLACE_URL`, and run signed installation registration. Do not insert a fake
   `InstallationRegistration` row directly, because that bypasses proof of private-key ownership.

### Stage B5: Reconcile and activate

Confirm project ID, gateway, installation ID, public-key fingerprint, school slug, and marketplace
registration all agree. Mark the school `ACTIVE` only after cryptographic registration succeeds.

## 9. Platform Admin interface

### 9.1 School directory

The list shows:

- school, slug, plan, and commercial status;
- provisioning state and last successful checkpoint;
- Railway project/environment/region;
- gateway/custom domain and TLS state;
- installation claim state, core version, and last marketplace heartbeat;
- backup and update status;
- open alerts and pending actions.

### 9.2 Create school wizard

Five explicit steps:

1. Customer and school identity.
2. Hosting, region, release, and expected cost.
3. Domain and communications.
4. Security and owner bootstrap delivery method.
5. Review, reason, and approval request.

The final button says **Request provisioning**, not **Create**, so the external effect is clear.

### 9.3 Adopt existing school wizard

Steps:

1. Enter Railway project ID and gateway.
2. Run read-only discovery.
3. Compare detected identity with directory candidates.
4. Confirm create/match decision.
5. Register or adopt installation.
6. Run readiness checks.

### 9.4 School detail

Tabs:

- Overview;
- Provisioning timeline;
- Installation identity;
- Domains;
- Marketplace and entitlements;
- Backups and recovery drills;
- Updates;
- Alerts;
- Audit history.

Dangerous actions are separated visually, require re-authentication, an internal reason, and—where
required—a second approver.

## 10. Control capabilities

Platform Admin may:

- create, approve, retry, or cancel provisioning jobs;
- view sanitized service/deployment status;
- manage marketplace account state and entitlements;
- initiate custom-domain verification;
- schedule signed core updates and observe acknowledgement;
- request a backup or restore drill and see results;
- rotate enrollment credentials and marketplace installation keys;
- suspend marketplace access;
- begin a reversible decommission workflow.

Platform Admin may not:

- browse the school database or files;
- retrieve owner passwords, JWT secrets, private keys, or provider credentials;
- impersonate a school user;
- execute arbitrary commands in a school container;
- install/activate plugins without local school-admin confirmation;
- delete a production school or database in a one-step action.

## 11. Required backend components

Planning packages:

1. `SchoolProvisioningRequest` and `SchoolProvisioningAttempt` persistence.
2. Explicit transition service with idempotency and advisory locking.
3. Railway adapter limited to an approved workspace and resource allowlist.
4. Background worker with bounded retries and per-school serialization.
5. Secret-delivery adapter that never writes plaintext secrets to the database.
6. Public school-discovery validator with SSRF protection and DNS/IP revalidation.
7. Installation enrollment orchestration using existing token and signature services.
8. Reconciliation scheduler comparing expected and observed infrastructure metadata.
9. Signed remote-operation request/acknowledgement protocol for backup/update tasks.
10. Alerting and operator notification adapters.

## 12. API plan

```text
POST /platform/v1/schools/provisioning-requests
GET  /platform/v1/schools/provisioning-requests
GET  /platform/v1/schools/provisioning-requests/:id
POST /platform/v1/schools/provisioning-requests/:id/submit
POST /platform/v1/schools/provisioning-requests/:id/approve
POST /platform/v1/schools/provisioning-requests/:id/cancel
POST /platform/v1/schools/provisioning-requests/:id/retry

POST /platform/v1/schools/adoptions/discover
POST /platform/v1/schools/adoptions
GET  /platform/v1/schools/:id/infrastructure
POST /platform/v1/schools/:id/reconcile
GET  /platform/v1/schools/:id/operations
POST /platform/v1/schools/:id/operations
```

Every mutation accepts an idempotency key and internal reason. External-effect endpoints return a
job resource and `202 Accepted`; they do not hold an HTTP request open while Railway deploys.

## 13. Security controls

- Railway credential stored only in the provisioning worker environment.
- Prefer a workspace/project-scoped token over a personal CLI session.
- Separate production and staging Railway credentials.
- Encrypt sensitive job payloads; redact environment values from logs.
- Validate gateway URLs against approved Railway/custom-domain records and block private,
  loopback, link-local, and metadata-service addresses.
- Require recent MFA for provisioning, adoption, suspension, restore, and decommission operations.
- Two-person approval for infrastructure creation, restore into production, credential rotation,
  custom-domain replacement, and decommissioning.
- Signed, expiring remote-operation envelopes with nonce/replay protection.
- Rate limits and one active provisioning attempt per school.
- Append-only audit export and alerting for failed or unusual privileged actions.

## 14. Failure and recovery rules

| Failure | Required behavior |
|---|---|
| Project created, database creation fails | retain project ID, mark retryable, resume without creating another project |
| Service deploy fails | preserve logs/reference, retry only failed service |
| Enrollment token expires | revoke/replace token; never reuse plaintext |
| Registration signature fails | stop activation and investigate identity mismatch |
| Gateway health fails | keep school non-active; preserve private services for diagnosis |
| Domain validation fails | retain Railway domain as rollback and keep custom domain pending |
| Control-plane timeout | reconcile Railway state before retrying any mutation |
| Duplicate identifiers | block and require human resolution |
| Worker crash | advisory lock releases; next attempt resumes from durable checkpoint |

## 15. Reconciliation

Run reconciliation after every mutation and periodically thereafter. Compare:

- expected versus observed Railway project/service IDs;
- gateway and custom-domain state;
- expected core version versus last signed school heartbeat;
- installation registration and key fingerprint;
- backup age and latest recovery-drill outcome;
- unresolved provisioning steps and stale operations.

Never infer that a school is deleted because Railway is temporarily unavailable. Use `UNKNOWN` or
`DEGRADED`, alert, and retry.

## 16. Delivery phases

### Phase 1 — Canonical control plane and directory correctness

- choose the single production marketplace database;
- point Platform Admin to that canonical API;
- expose Railway project/gateway fields in the school form and detail view;
- add uniqueness constraints and migration tests;
- document staging/production separation.

Exit: a manually deployed school can be created in the directory without direct database access.

### Phase 2 — Railway-first adoption

- add discovery endpoint and adoption wizard;
- implement SSRF-safe public identity validation;
- support create, exact-match, conflict, register, and adopt cases;
- add reconciliation result and audit timeline.

Exit: project `b5b07c38…` is adopted through the UI, cryptographically registered, and shown
`ACTIVE` without direct database writes.

### Phase 3 — Durable Platform-first provisioning

- add job models, transition service, worker, Railway adapter, and secret delivery;
- add approval workflow and idempotent retry/compensation;
- turn the existing provisioning script into an adapter/library used by the worker;
- add provisioning wizard and timeline.

Exit: a clean school is provisioned from Platform Admin and reaches `READY` after a worker restart
test and a forced partial failure.

### Phase 4 — Domains, backups, and updates

- integrate the existing custom-domain state machine;
- implement signed backup/update operation requests and acknowledgements;
- show backup age, restore-drill result, update channel/version, and rollback state.

Exit: one school completes custom-domain activation, backup/restore drill, upgrade, and rollback
from the control plane with full audit evidence.

### Phase 5 — Production hardening

- threat model and penetration test;
- secret-rotation and compromised-worker drill;
- concurrency, timeout, and reconciliation load tests;
- alert delivery and on-call runbooks;
- finance approval for project creation quotas and cost limits;
- legal/privacy review and production release approval.

Exit: all acceptance gates pass in staging, followed by a controlled production pilot.

## 17. Test plan

Required automated tests:

- role/permission matrix and recent-MFA enforcement;
- state-transition and forbidden-transition tests;
- idempotent create/retry and same-school locking;
- duplicate slug/project/installation conflict tests;
- token hashing, expiry, revocation, and single-use tests;
- signed registration and replay rejection;
- SSRF, redirect, DNS rebinding, timeout, and oversized-response tests;
- secret/log redaction tests;
- worker crash and resume tests;
- Railway adapter contract fixtures;
- browser accessibility and end-to-end provisioning/adoption journeys.

Required hosted drills:

1. Adopt the existing Angkor1 project.
2. Provision a disposable school from Platform Admin.
3. Fail after project creation and prove retry creates no duplicate.
4. Restart the worker during deployment and prove safe resume.
5. Replace an expired enrollment token.
6. Activate and roll back a custom domain.
7. Back up, restore, upgrade, and roll back.
8. Suspend marketplace access without disrupting the school's local core.

## 18. Definition of done

- Platform Admin and the public marketplace use the intended canonical production control plane.
- An operator can create a directory record or adopt an existing Railway school through the UI.
- A Railway project cannot appear under two schools.
- Activation requires signed installation registration, not metadata alone.
- Provisioning is asynchronous, idempotent, resumable, and fully audited.
- Secrets and school business data never enter control-plane responses or logs.
- Operators can see infrastructure, marketplace, domain, backup, update, and alert state.
- Every destructive or high-impact action has re-authentication, reason, approval, and recovery.
- The Angkor1 adoption and one clean Platform-first deployment pass hosted acceptance drills.

## 19. Decision required before coding

Approve or revise these decisions:

1. One canonical production marketplace database for marketplace and Platform Admin.
2. Platform-first provisioning is the normal path; Railway-first is an adoption/migration path.
3. Infrastructure creation requires two-person approval.
4. Platform Admin controls metadata and signed operations, never school data or arbitrary shell.
5. The local school administrator keeps final plugin installation/activation authority.
6. Railway tokens are scoped service credentials held only by a provisioning worker.
7. The first implementation target is adoption of Angkor1 project `b5b07c38…`, followed by a
   disposable Platform-first school.

Decision status: accepted by the project owner. Coding may proceed, but production infrastructure
mutation remains disabled until the worker's scoped Railway credential, quotas, hosted failure
drill, and rollback evidence pass Phase 3 acceptance.
