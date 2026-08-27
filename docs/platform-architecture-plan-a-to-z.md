# Wattanam V2 Platform Architecture: A-to-Z Delivery Plan

> Execution authority: [Platform Master Execution Plan](./platform-master-execution-plan.md). This document defines the target architecture; the master plan owns decisions, current-state reconciliation, work packages, estimates, owners, and release gates.

## Document Purpose

This document converts the Wattanam V2 platform vision into an executable engineering and product plan. It covers the complete path from the current application to a self-hosted, installable, extensible education platform with an official plugin repository and, later, a commercial third-party marketplace.

This plan complements [platform-architecture.md](./platform-architecture.md). The architecture document describes the target; this document describes how to reach it.

## 1. Product Definition

### 1.1 Product Goal

Wattanam V2 will allow a school or education organization to install and operate its own platform, control its own data, and extend the installation through free or paid plugins.

### 1.2 Initial Customer Profile

The first supported customer should be:

- One school or education organization.
- Able to use a managed cloud deployment or Linux VPS.
- Using a modern browser and stable internet or local network.
- Requiring web administration, staff workflows, parent access, and optional mobile access.
- Willing to use PostgreSQL and a Docker-based installation.

### 1.3 Initial Scope

The first commercial-quality release must provide:

- Repeatable self-hosted installation.
- First-run setup wizard.
- Core authentication, users, roles, permissions, settings, and audit logs.
- Plugin discovery, installation, activation, update, deactivation, and removal.
- Signed official plugin packages.
- Backup, restore, health checks, and update recovery.
- Documentation for owners, administrators, and plugin developers.

### 1.4 Explicit Non-Goals for Version 1

- PHP-only shared hosting.
- Unreviewed public plugin submissions.
- Arbitrary remote code execution from uploaded ZIP files.
- Automatic conversion of every existing feature into a plugin.
- Multi-region high availability for small installations.
- A full app store before the plugin API is stable.
- One central database containing customer school data.

## 2. Foundational Product Decisions

These decisions must be recorded as Architecture Decision Records before implementation proceeds too far.

| Decision | Recommended default | Reason |
|---|---|---|
| Deployment | Docker Compose on Linux | Repeatable and supportable |
| Backend | NestJS modular monolith | Matches current code and simplifies transactions |
| Web frontend | Next.js | Matches current application |
| Mobile | Expo application | Matches current application |
| Database | PostgreSQL | Existing Prisma model and production reliability |
| ORM/migrations | Prisma for core; controlled plugin migration API | Matches current backend |
| Installation tenancy | One organization per installation initially | Simpler isolation and operations |
| Plugin execution | Trusted server-side packages with signed releases | Practical for first-party ecosystem |
| Package format | Signed immutable archive plus manifest | Verifiable and portable |
| Storage | Local persistent volume first, S3-compatible optional | Simple default with growth path |
| Background jobs | Database-backed queue initially | Avoids requiring Redis for small installs |
| Marketplace | Separate central service | Keeps customer data independent |
| Licensing | Installation entitlement with offline grace period | Supports self-hosting reliably |

### 2.1 Decisions Requiring Product Owner Approval

1. Is Wattanam Core open source, source-available, or proprietary?
2. Is a license perpetual, subscription-based, or perpetual with paid updates?
3. Does one installation support exactly one school or multiple campuses?
4. Which modules are included in the base product?
5. Which countries, languages, currencies, and regulations are first-class at launch?
6. Is internet access required after installation?
7. Who may publish plugins during each release phase?

## 3. Target System Context

```text
Users
├── Platform owner
├── School administrator
├── Teacher and staff
├── Accountant
├── Student
├── Parent or guardian
└── Plugin developer

Customer Installation
├── Next.js web application
├── NestJS API and plugin host
├── Background worker
├── PostgreSQL database
├── Persistent file storage
└── Local update and backup manager

Central Wattanam Services
├── Release repository
├── Marketplace API
├── Identity and publisher accounts
├── Orders and entitlements
├── Signing service
├── Documentation
└── Security advisory service

External Providers
├── Email and SMS
├── Object storage
├── Payment gateway
├── Error reporting
└── Optional school integrations
```

No operational student, attendance, grade, fee, or staff data should be sent to central Wattanam services unless a separately disclosed feature explicitly requires it and the customer enables it.

## 4. Target Codebase Structure

Use a workspace-based monorepo so contracts, UI components, and build tooling can be shared without copying code.

```text
wattanam-v2/
├── apps/
│   ├── web/
│   ├── api/
│   ├── worker/
│   └── mobile/
├── packages/
│   ├── core-contracts/
│   ├── plugin-sdk/
│   ├── plugin-runtime/
│   ├── ui/
│   ├── configuration/
│   ├── logging/
│   └── testing/
├── plugins/
│   ├── announcements/
│   └── additional-official-plugins/
├── infrastructure/
│   ├── docker/
│   ├── reverse-proxy/
│   ├── scripts/
│   └── release/
├── docs/
│   ├── administration/
│   ├── development/
│   ├── plugins/
│   └── operations/
├── package.json
├── docker-compose.yml
└── example.env
```

Do not perform this reorganization as one uncontrolled move. Introduce workspace tooling first, then move one application or shared package at a time while tests remain green.

## 5. Core Domain Boundaries

### 5.1 Platform Core

Core owns functionality that every installation needs:

- Installation identity and version.
- Organization profile.
- Authentication and session management.
- Users, roles, permissions, and policy evaluation.
- Configuration and secret references.
- Localization, timezone, and currency defaults.
- Plugin lifecycle and registry.
- Event delivery and scheduled jobs.
- File storage abstraction.
- Notifications contract, but not necessarily every delivery provider.
- Audit trail.
- Health, diagnostics, maintenance mode, and updates.
- Backup and restore orchestration.

### 5.2 Candidate Official Plugins

- Announcements.
- Attendance.
- Timetable.
- Courses and learning content.
- Assignments.
- Exams and scoring.
- Fees and accounting.
- Salary and payroll.
- Staff CV.
- Transportation and bus tracking.
- Parent portal.
- Card designer and card aliases.
- Advanced notification providers.

### 5.3 Features That Must Stay in Core Initially

- Auth, JWT/session verification, and password recovery.
- User identity.
- Roles and permission checks.
- Organization and global settings.
- Audit logging.
- Plugin manager.
- Database, migrations, and platform bootstrapping.

Moving these areas into plugins would create circular dependencies and unsafe failure modes.

## 6. Identity, Access, and Authorization

### 6.1 Authentication

Support initially:

- Username or email plus password.
- Secure password reset.
- Configurable session duration.
- Forced logout after credential or role changes.
- Optional multi-factor authentication for privileged users.

Future providers may include SAML, OpenID Connect, Google Workspace, and Microsoft Entra ID through reviewed integration plugins.

### 6.2 Authorization Model

Use permission-based authorization with roles as permission bundles.

Permission naming convention:

```text
<domain>.<resource>.<action>
```

Examples:

```text
core.users.read
core.users.manage
attendance.records.read
attendance.records.manage
fees.invoices.issue
```

Rules:

- Backend authorization is mandatory; hiding frontend controls is not security.
- Plugin permissions are namespaced by plugin ID.
- Plugins cannot grant themselves core administrator permissions.
- Permission changes are audited.
- Default roles are templates and may be customized per installation.

### 6.3 Installation Owner

The first administrator created during setup becomes the installation owner. Ownership transfer must require re-authentication and create a high-priority audit event.

## 7. Configuration and Secrets

### 7.1 Configuration Layers

Apply configuration in this order:

1. Safe application defaults.
2. Environment variables.
3. Installation configuration stored in the database.
4. Organization settings.
5. User preferences.

Secrets must never be returned through normal configuration APIs.

### 7.2 Required Environment Contract

Provide an `example.env` containing documentation but no real secrets. Expected variables include:

```text
APP_URL
API_URL
DATABASE_URL
JWT_SECRET
ENCRYPTION_KEY
STORAGE_DRIVER
STORAGE_PATH
MARKETPLACE_URL
UPDATE_CHANNEL
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
```

Startup should fail with a clear message when a required production secret is missing or uses an insecure default.

### 7.3 Secret Rotation

Document rotation procedures for JWT signing, stored credentials, marketplace tokens, email credentials, and backup encryption keys. Where immediate rotation would invalidate data, support a current and previous key during migration.

## 8. Database and Data Lifecycle

### 8.1 Core Database Rules

- Use PostgreSQL as the canonical production database.
- Use UUID or another collision-resistant identifier for externally referenced records.
- Store timestamps in UTC and render in the installation timezone.
- Add `createdAt`, `updatedAt`, and appropriate ownership fields consistently.
- Use foreign keys and unique constraints for integrity.
- Avoid database access directly from frontend code.
- Define retention and deletion behavior for sensitive data.

### 8.2 Plugin Data Ownership

Each plugin declares the tables or models it owns. Recommended table prefix:

```text
plugin_<plugin_key>_<table_name>
```

Plugins may reference stable core identifiers through documented contracts. A plugin must not write directly to another plugin's tables.

### 8.3 Migration Rules

- Migrations are immutable after release.
- Every migration is identified by plugin ID and version.
- Migration history is stored centrally.
- Installation and update perform a dry compatibility check first.
- Destructive schema changes require an explicit release note and backup.
- Failed migrations prevent activation and place the plugin into `failed` state.
- Roll-forward recovery is preferred; rollback scripts are used when demonstrably safe.

### 8.4 Privacy and Retention

Define retention categories for:

- Authentication and security logs.
- Audit records.
- Student records.
- Attendance.
- Assessments.
- Financial records.
- Messages and notifications.
- Location data.
- Backups.

Provide export and deletion workflows appropriate to the customer's legal obligations. Do not promise compliance with a regulation until the complete operational process has been verified.

## 9. Plugin System Specification

### 9.1 Package Contents

```text
wattanam-attendance-1.0.0.wtp
├── plugin.json
├── checksums.json
├── signature.sig
├── backend/
├── frontend/
├── migrations/
├── assets/
├── locales/
├── README.md
└── CHANGELOG.md
```

`.wtp` may internally be a ZIP archive, but it must be treated as a signed Wattanam package rather than a generic executable upload.

### 9.2 Manifest Contract

The manifest must include:

- Globally unique plugin ID.
- Display name and description.
- Semantic version.
- Required core version range.
- Runtime and SDK version requirements.
- Publisher identity.
- License type.
- Backend and frontend entry points.
- Requested permissions and capabilities.
- Plugin dependencies and compatible ranges.
- Migration list.
- Supported languages.
- Package checksum.
- Support and privacy URLs.

### 9.3 Lifecycle States

```text
available → downloaded → verified → installed → active
                                      ↓          ↓
                                   removed    inactive
                                                  ↓
                                               removed
```

Exceptional states:

- `incompatible`
- `verification_failed`
- `migration_failed`
- `disabled_by_security_policy`
- `update_available`

### 9.4 Lifecycle Operations

The plugin manager must implement:

- Discover package.
- Validate archive paths and size limits.
- Verify checksum and publisher signature.
- Parse and validate manifest schema.
- Resolve dependencies without circular graphs.
- Check core and runtime compatibility.
- Preview requested permissions.
- Create backup or recovery point.
- Install files into a versioned location.
- Run migrations.
- Register extension points.
- Activate and perform health check.
- Disable without deleting data.
- Uninstall while preserving data.
- Permanently purge data through a separately confirmed operation.

### 9.5 Backend Extension API

The supported SDK should expose narrow capabilities:

- Route registration under a plugin namespace.
- Dependency injection through public service interfaces.
- Event publish and subscribe.
- Scheduled-job registration.
- Permission registration.
- Storage access scoped to the plugin.
- Settings access scoped to the plugin.
- Audit-event creation.
- Notification requests.

Plugins should not receive an unrestricted application container, raw filesystem access, or arbitrary access to every database table through the official SDK.

### 9.6 Frontend Extension API

Allow plugins to register:

- Routes beneath approved route areas.
- Navigation items.
- Dashboard widgets.
- Settings panels.
- Table actions.
- Form fields at documented slots.
- Localized labels.

The UI SDK should provide shared layout, form, dialog, table, notification, error, and permission-aware components.

### 9.7 Events and Hooks

Events describe completed facts and should use versioned payloads:

```text
core.user.created.v1
attendance.record.created.v1
fees.invoice.paid.v1
```

Rules:

- Event names include domain and version.
- Payloads contain stable identifiers, not internal ORM objects.
- Sensitive fields are excluded by default.
- Subscriber failures are isolated and retried where appropriate.
- Important asynchronous events use an outbox table to avoid data loss.
- Synchronous hooks are reserved for cases requiring an immediate decision.

## 10. Plugin Developer Experience

Provide:

- Plugin SDK package.
- Command-line scaffolding tool.
- Example plugin.
- Local development environment.
- Manifest JSON schema.
- API reference.
- UI component catalog.
- Migration guide.
- Testing utilities.
- Compatibility checker.
- Package, sign, and validate commands.

Suggested commands:

```text
wattanam plugin create
wattanam plugin dev
wattanam plugin test
wattanam plugin validate
wattanam plugin pack
wattanam plugin sign
wattanam plugin publish
```

The official example plugin should demonstrate a settings page, permission, API route, database migration, navigation entry, event subscriber, and automated tests.

## 11. Installer Design

### 11.1 Preflight Checks

The installer validates:

- Supported application version.
- Database connectivity and PostgreSQL version.
- Writable persistent directories.
- Required secrets.
- Public application URL.
- HTTPS in production.
- Available disk space.
- Ability to run migrations.

### 11.2 Setup Wizard Steps

1. Select language.
2. Review requirements and license.
3. Configure or verify the database.
4. Configure school name, timezone, locale, and currency.
5. Create the installation owner.
6. Configure file storage.
7. Configure outbound email or skip with a warning.
8. Select initial official plugins.
9. Run migrations and seed required core data.
10. Display recovery information and finish.

### 11.3 Installer Security

- Create an installation lock after success.
- Require a server-side recovery token to reopen setup.
- Never display full secrets after they are saved.
- Rate-limit setup endpoints.
- Prevent setup if an initialized core database already exists.
- Record setup completion without storing the owner's plaintext password.

### 11.4 Unattended Installation

Provide a CLI for automated deployments:

```text
wattanam install --config /run/secrets/install-config.json
```

The command must be idempotent or refuse safely when installation is already complete.

## 12. Deployment Architecture

### 12.1 Small Installation

```text
Internet
   ↓
Reverse proxy with HTTPS
   ↓
Web/API containers
   ↓
PostgreSQL + persistent uploads
```

### 12.2 Growing Installation

```text
Load balancer
├── Web replicas
├── API replicas
└── Worker replicas
       ↓
Managed PostgreSQL
S3-compatible storage
Shared job queue
Centralized logs and monitoring
```

### 12.3 Docker Compose Services

- `web`
- `api`
- `worker`
- `postgres` for the bundled option
- `reverse-proxy` for the documented standalone deployment
- Optional backup job

Containers should run as non-root, use read-only filesystems where practical, expose health checks, and persist only declared volumes.

### 12.4 Release Artifacts

Every core release should produce:

- Versioned web, API, and worker images.
- Multi-architecture images where required.
- Software bill of materials.
- Checksums and signatures.
- Docker Compose template.
- Environment template.
- Migration preview.
- Release and rollback notes.

## 13. Marketplace Platform

### 13.1 Marketplace Components

- Public catalog web application.
- Marketplace API.
- Customer and publisher identity.
- Plugin metadata database.
- Object storage for immutable packages.
- Signing service isolated from public workloads.
- Order, payment, refund, and entitlement service.
- Review and moderation console.
- Security advisory service.
- Download audit and analytics.

### 13.2 Core Marketplace Records

- Publisher.
- Plugin.
- Plugin version.
- Package artifact.
- Compatibility range.
- Price and regional availability.
- Order and payment.
- Installation entitlement.
- Review status.
- Security advisory.
- Download event.

### 13.3 Publication Workflow

```text
Draft
  ↓
Automated validation
  ↓
Security and quality review
  ↓
Publisher corrections if required
  ↓
Approval
  ↓
Package signing
  ↓
Publication
  ↓
Monitoring, updates, or withdrawal
```

### 13.4 Review Requirements

- Valid manifest and semantic version.
- Reproducible or documented build.
- Dependency vulnerability scan.
- Static code analysis.
- Archive safety checks.
- Permission justification.
- Migration safety review.
- Installation, upgrade, and uninstall tests.
- Privacy disclosure.
- Support contact and documentation.
- Compatibility test against supported core releases.

## 14. Licensing and Entitlements

### 14.1 Installation Identity

Each installation generates an identifier and local key pair. Marketplace registration associates that installation with a customer account without uploading school operational data.

### 14.2 Entitlement Token

A signed entitlement should contain only necessary claims:

- Installation ID.
- Plugin ID.
- Purchased edition.
- Valid update period.
- Issued and expiry timestamps.
- Optional environment allowance for production and staging.

The installation verifies the signature locally using a pinned public key.

### 14.3 Offline Behavior

- Cache entitlements locally.
- Allow installed software to continue operating.
- Require connectivity primarily for new downloads and entitlement refresh.
- Provide a documented offline activation file for restricted networks.
- Never block access to customer data because the marketplace is unavailable.

### 14.4 Refund and Revocation

Revocation should stop future downloads and updates. It should not silently delete a plugin or its data. Security revocation is separate and may disable a vulnerable version only under a clearly disclosed emergency policy.

## 15. Update System

### 15.1 Release Channels

- `stable`: recommended for production.
- `candidate`: final pre-release testing.
- `development`: internal or developer installations.

### 15.2 Core Update Flow

1. Fetch signed release metadata.
2. Check current version and upgrade path.
3. Check plugin compatibility.
4. Warn about incompatible or abandoned plugins.
5. Create a verified backup.
6. Enter maintenance mode.
7. Pull versioned images or install the package.
8. Run migrations.
9. Start services and run health checks.
10. Exit maintenance mode or execute recovery procedure.

### 15.3 Plugin Update Flow

1. Resolve dependency graph.
2. Verify entitlement if required.
3. Download immutable signed package.
4. Verify signature and checksum.
5. Back up affected data and current plugin version.
6. Install into a new versioned directory.
7. Run migrations.
8. Switch the active version.
9. Run plugin health checks.
10. Keep recovery information until the update is confirmed.

### 15.4 Compatibility Policy

- Use semantic versioning for core and SDK releases.
- Maintain a published support window.
- Deprecate APIs before removal.
- Provide automated compatibility reports.
- Prevent known-incompatible updates by default.
- Permit a documented expert override only with a backup and explicit warning.

## 16. Backup, Restore, and Disaster Recovery

### 16.1 Backup Contents

- PostgreSQL database dump.
- Uploaded files.
- Non-secret configuration export.
- Encrypted secret material when explicitly selected.
- Installed core and plugin version manifest.
- Backup metadata and checksums.

### 16.2 Backup Policies

- Manual and scheduled backups.
- Local and S3-compatible targets.
- Encryption at rest.
- Configurable retention.
- Backup completion notifications.
- Regular automated restore tests.

### 16.3 Restore Workflow

1. Validate backup checksum and version manifest.
2. Verify target runtime compatibility.
3. Stop writes or enter maintenance mode.
4. Preserve the current state as a recovery point.
5. Restore database and files.
6. Reconcile core and plugin versions.
7. Run health and integrity checks.
8. Resume service only after validation.

### 16.4 Recovery Objectives

Define supported targets before launch:

- Recovery point objective: maximum acceptable data loss.
- Recovery time objective: maximum acceptable downtime.
- Backup retention duration.
- Responsibility boundary between Wattanam and self-hosting customers.

## 17. Security Program

### 17.1 Application Security

- Secure password hashing.
- HttpOnly, Secure, and appropriate SameSite cookies where cookies are used.
- CSRF protection for cookie-authenticated mutations.
- Strict CORS policy.
- Input validation at API boundaries.
- Output encoding and sanitized rich text.
- Rate limiting and abuse protection.
- File type, size, and content validation.
- Least-privilege database credentials.
- Content Security Policy for the web application.
- Dependency and container scanning.

### 17.2 Plugin Supply-Chain Security

- Isolated signing keys.
- Signed packages and metadata.
- Immutable published artifacts.
- Package checksums.
- Publisher verification.
- Dependency lockfiles.
- Software bill of materials.
- Security advisory and vulnerable-version blocking.
- Audit trail from upload through publication.

### 17.3 Operational Security

- Non-root containers.
- TLS by default.
- Secret storage and rotation guidance.
- Database and storage network restrictions.
- Administrative re-authentication for high-risk actions.
- Audit log protection.
- Documented incident-response process.

### 17.4 Security Release Process

Define:

- Private vulnerability reporting channel.
- Severity classification.
- Patch ownership and response targets.
- Coordinated disclosure process.
- Security advisory format.
- Emergency update mechanism.
- Supported-version policy.

## 18. Reliability and Observability

### 18.1 Health Endpoints

- Liveness: process can respond.
- Readiness: database and required services are usable.
- Detailed diagnostics: administrator-only report.
- Version: core, build, schema, and active plugin versions.

### 18.2 Logging

Use structured logs containing:

- Timestamp.
- Severity.
- Request or correlation ID.
- Installation-local user ID where appropriate.
- Plugin ID and version.
- Error code.
- Safe diagnostic context.

Never log passwords, access tokens, complete payment data, or unnecessary student information.

### 18.3 Metrics

Track locally:

- Request rate, latency, and failures.
- Database pool utilization.
- Job queue age and failures.
- Storage usage.
- Backup age and status.
- Plugin errors.
- Email and notification delivery status.

Optional telemetry must be disclosed, minimized, configurable, and disabled where required by customer policy.

## 19. Testing Strategy

### 19.1 Test Layers

- Unit tests for domain rules and utility code.
- Integration tests for database, storage, and plugin lifecycle.
- Contract tests for plugin SDK interfaces.
- API tests for authentication and authorization.
- End-to-end tests for critical user journeys.
- Installation and upgrade tests from every supported version.
- Backup and restore tests.
- Security tests for packages, permissions, and malicious archives.
- Load tests for attendance peaks and reporting.
- Mobile compatibility tests for supported platforms.

### 19.2 Required Critical Journeys

- Fresh installation and owner creation.
- Login, logout, password reset, and permission enforcement.
- Install and activate an official plugin.
- Reject a tampered or incompatible plugin.
- Upgrade core with compatible plugins.
- Block upgrade with incompatible plugins and explain recovery.
- Back up and restore a complete installation.
- Disable a failed plugin without losing access to core administration.
- Export customer-owned data.

### 19.3 Plugin Certification Matrix

Each plugin release is tested against:

- Minimum supported core version.
- Latest stable core version.
- Supported PostgreSQL versions.
- Fresh installation.
- Upgrade from its previous supported version.
- Deactivation and reactivation.
- Uninstall with data preservation.
- Permanent purge where implemented.

## 20. Continuous Integration and Delivery

### 20.1 Pull Request Pipeline

Every change should run:

1. Formatting and lint checks.
2. Type checking.
3. Unit tests.
4. Integration tests.
5. Plugin contract tests.
6. Dependency and secret scanning.
7. Production builds.
8. Migration validation.

### 20.2 Release Pipeline

1. Validate version and changelog.
2. Run complete test suite.
3. Build immutable artifacts.
4. Generate software bill of materials.
5. Scan dependencies and containers.
6. Sign artifacts and metadata.
7. Deploy to a clean staging installation.
8. Test fresh install, upgrade, backup, and restore.
9. Publish to the selected channel.
10. Monitor release health and retain rollback artifacts.

### 20.3 Branch and Version Policy

- Protect the main branch.
- Require reviewed pull requests.
- Use short-lived feature branches.
- Tag immutable releases.
- Maintain release branches only for supported security fixes.
- Record schema and SDK compatibility in release metadata.

## 21. Documentation Plan

### 21.1 Installation Owner Documentation

- Hosting requirements.
- Docker installation.
- DNS and HTTPS.
- Database configuration.
- Storage configuration.
- Email configuration.
- Backup and restore.
- Core upgrades.
- Troubleshooting and recovery.

### 21.2 School Administrator Documentation

- Initial organization setup.
- Users, roles, and permissions.
- Plugin installation and configuration.
- Audit logs.
- Data import and export.
- Privacy and retention settings.

### 21.3 Plugin Developer Documentation

- Architecture and SDK concepts.
- Manifest reference.
- Backend and frontend extension APIs.
- Permissions and security.
- Migrations and data ownership.
- Testing and packaging.
- Marketplace submission.
- Compatibility and deprecation policies.

### 21.4 Release Documentation

Every release requires:

- User-facing release notes.
- Administrator upgrade notes.
- Migration and downtime expectations.
- Plugin compatibility report.
- Known issues.
- Recovery instructions.
- Security notes when applicable.

## 22. Marketplace Governance

Before accepting third-party plugins, publish:

- Developer agreement.
- Marketplace content policy.
- Security requirements.
- Privacy requirements.
- Review and appeal process.
- Pricing and revenue-share rules.
- Refund policy.
- Support obligations.
- Vulnerability response obligations.
- Abandoned-plugin policy.
- Trademark and naming rules.

Wattanam must reserve the ability to remove a listing, block a vulnerable download, transfer maintenance with legal permission, or mark a plugin abandoned. These actions must be auditable and communicated clearly.

## 23. Support and Operations Model

Define support boundaries for:

- Wattanam-managed cloud installations.
- Customer-managed Docker installations.
- Core defects.
- Official plugin defects.
- Third-party plugin defects.
- Unsupported server modifications.
- Database recovery.
- Security incidents.

Collect a safe diagnostic bundle containing versions, health results, sanitized configuration, and recent application errors. Creation and sharing of this bundle must require administrator consent.

## 24. Migration from the Current Application

### Stage 1: Baseline and Inventory

- Freeze and document the current runtime requirements.
- Inventory every backend module, frontend route, scheduled task, database model, and external integration.
- Map dependencies between modules.
- Classify each capability as core, official plugin, shared library, or deprecated.
- Add baseline build and critical-flow tests before moving code.

Deliverable: current-system map and approved core/plugin boundary.

### Stage 2: Production Configuration

- Remove insecure production fallbacks.
- Create validated configuration loading.
- Add environment template and secret documentation.
- Add health, readiness, and version reporting.
- Standardize logs and error responses.

Deliverable: configurable application that fails safely when misconfigured.

### Stage 3: Repeatable Packaging

- Produce reproducible Docker images.
- Add Docker Compose services and volumes.
- Automate core migrations.
- Add first-run owner provisioning.
- Add backup and restore commands.

Deliverable: a clean server can install and run Wattanam from documented steps.

### Stage 4: Core Contracts

- Introduce workspace packages.
- Define permission, event, configuration, storage, and audit interfaces.
- Refactor current modules to consume public interfaces.
- Add contract tests.

Deliverable: stable internal boundaries ready for plugin extraction.

### Stage 5: Plugin Runtime

- Implement manifest parsing and validation.
- Implement registry and lifecycle states.
- Implement extension registration.
- Implement migration tracking.
- Implement signed local package installation.
- Build administrator plugin-management UI.

Deliverable: an official package can be installed, activated, disabled, and removed safely.

### Stage 6: First Plugin Extraction

- Extract announcements as the reference plugin.
- Move its backend, frontend, permissions, migrations, and navigation into plugin boundaries.
- Publish events rather than importing internal modules directly.
- Document every difficulty and adjust the SDK.

Deliverable: reference plugin proving the complete development lifecycle.

### Stage 7: Update Repository

- Build signed release metadata endpoints.
- Implement update checks and compatibility resolution.
- Add safe package download and verification.
- Test core and plugin upgrade paths.

Deliverable: official updates can be discovered and installed safely.

### Stage 8: Commercial Services

- Add marketplace accounts and installation registration.
- Add orders, payments, and entitlements.
- Add offline-verifiable license tokens.
- Add publisher and review tooling.

Deliverable: selected paid official plugins can be purchased and installed.

### Stage 9: Third-Party Pilot

- Invite a small number of trusted developers.
- Review all submissions manually.
- Measure SDK gaps, review time, support burden, and security findings.
- Stabilize policies and tooling.

Deliverable: evidence that the ecosystem can operate safely before public launch.

## 25. Work Breakdown and Acceptance Gates

### Milestone A: Architecture Baseline

Exit criteria:

- Product decisions are approved.
- Current modules and dependencies are mapped.
- Core/plugin classification is agreed.
- Architecture Decision Records exist for deployment, database, tenancy, plugin runtime, storage, and licensing.
- Version 1 non-goals are documented.

### Milestone B: Installable Core

Exit criteria:

- Clean Docker installation succeeds from documentation.
- Setup wizard creates the first owner.
- No insecure default secret is accepted in production.
- Data and uploads persist across container replacement.
- Backup and restore succeed in automated testing.
- Health and version endpoints report correct state.

### Milestone C: Plugin-Capable Core

Exit criteria:

- Manifest schema and SDK are versioned.
- Signed package verification works.
- Tampered packages are rejected.
- Permissions and dependencies are previewed before installation.
- A plugin failure cannot prevent access to safe-mode administration.
- Migrations and lifecycle operations have integration tests.

### Milestone D: Official Plugin Repository

Exit criteria:

- Official packages are immutable and signed.
- Installations can discover compatible releases.
- Core update checks account for active plugins.
- Security advisories can identify affected installations locally.
- Upgrade and recovery paths are documented and tested.

### Milestone E: Paid Official Plugins

Exit criteria:

- Purchases create auditable entitlements.
- Entitlements verify locally during marketplace outages.
- Expired update access does not destroy functionality or data.
- Refund and revocation behavior is documented.
- Payment webhooks are idempotent and tested.

### Milestone F: Third-Party Marketplace

Exit criteria:

- Publisher verification is operational.
- Automated and manual review gates are enforced.
- Policies and agreements are published.
- Vulnerable and abandoned plugin procedures are tested.
- Support ownership is clear to customers.

## 26. Suggested Delivery Sequence

The sequence below is more important than a calendar estimate. Duration depends on team size, existing test coverage, and the amount of refactoring discovered.

| Order | Workstream | Depends on |
|---:|---|---|
| 1 | Product decisions and inventory | Nothing |
| 2 | Configuration and production hardening | Inventory |
| 3 | Docker packaging and setup | Configuration |
| 4 | Backup, restore, health, and observability | Packaging |
| 5 | Core contracts and workspace foundations | Inventory |
| 6 | Plugin manifest, SDK, and runtime | Core contracts |
| 7 | Announcements reference plugin | Plugin runtime |
| 8 | Signed repository and update client | Packaging and plugin runtime |
| 9 | Licensing and paid official plugins | Update repository |
| 10 | Third-party publisher pilot | Stable SDK and governance |
| 11 | Public marketplace | Successful pilot |

Parallel work is safe only where contracts are already agreed. Marketplace UI should not race ahead of package security, entitlement semantics, and plugin compatibility rules.

## 27. Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Plugins depend on private core internals | Updates break installations | Versioned SDK, contract tests, review rules |
| Plugin migrations damage customer data | Severe data loss | Mandatory backup, migration tests, recovery procedures |
| Current modules are tightly coupled | Extraction takes longer | Dependency inventory and incremental refactoring |
| Marketplace outage disables paid features | School operations stop | Offline verification and grace periods |
| Malicious plugin reaches customers | Data or server compromise | Signing, review, scans, permissions, advisories |
| Too many supported hosting variants | Support becomes unsustainable | Publish a narrow support matrix |
| Core update conflicts with plugins | Customers cannot upgrade | Compatibility resolver and supported release window |
| Licensing is too aggressive | Customer distrust | Preserve operation and data access offline |
| Backups exist but cannot restore | False sense of safety | Automated restore testing |
| Public SDK changes too frequently | Ecosystem instability | Stabilization period and deprecation policy |
| Customer data leaks into telemetry | Legal and trust damage | Data minimization, opt-in controls, review |

## 28. Definition of Done

A platform capability is done only when:

- Product behavior and failure behavior are defined.
- Authorization and privacy implications are reviewed.
- Code is reviewed and automated tests pass.
- Database changes have upgrade and recovery plans.
- Logs and health signals are sufficient for support.
- User and administrator documentation is updated.
- Plugin/API compatibility impact is recorded.
- Deployment and rollback are tested.
- No known critical or high-severity security issue remains unresolved.

A release is done only when a clean installation, supported-version upgrade, backup, restore, and critical workflows all pass against release artifacts.

## 29. First 30 Implementation Tasks

1. Approve the Version 1 customer and hosting scope.
2. Decide the core license and paid-plugin model.
3. Decide one-school versus multi-organization installation behavior.
4. Inventory current backend modules and their imports.
5. Inventory frontend routes and their API dependencies.
6. Inventory Prisma models by owning domain.
7. Inventory environment variables and external providers.
8. Classify current modules as core, plugin, shared, or deprecated.
9. Record initial Architecture Decision Records.
10. Add an environment schema with production validation.
11. Remove insecure production secret fallbacks.
12. Add structured logging and correlation IDs.
13. Add liveness, readiness, and version endpoints.
14. Define supported Node.js and PostgreSQL versions.
15. Create production web and API Docker images.
16. Add a worker process boundary.
17. Create Docker Compose with persistent volumes.
18. Automate database migration on controlled startup.
19. Implement first-run installation state.
20. Implement owner creation and installer lock.
21. Create database backup command.
22. Create file backup and complete restore commands.
23. Add automated fresh-install and restore tests.
24. Define the plugin manifest JSON schema.
25. Define permission and event naming standards.
26. Create the first plugin SDK interfaces.
27. Implement plugin registry and lifecycle states.
28. Implement package path, checksum, and signature validation.
29. Create safe mode for disabling failed plugins.
30. Extract announcements as the reference plugin.

## 30. Recommended Immediate Milestone

> Historical sequencing note: the Installable Core foundation described below was verified on 2026-08-27. Current priorities are the first executable sprint in the [master execution plan](./platform-master-execution-plan.md).

Do not begin with payments or a public marketplace. Begin with the **Installable Core** milestone.

The milestone demonstration should be:

1. Start from a clean supported Linux server.
2. Download the Wattanam release package.
3. Configure the required environment values.
4. Run Docker Compose.
5. Complete the setup wizard.
6. Sign in as installation owner.
7. Create a backup.
8. Replace the application containers.
9. Confirm that the database and uploads persist.
10. Restore the backup into a clean test installation.

Once this workflow is repeatable and tested, implement the plugin runtime and extract announcements as the first reference plugin. This order establishes a reliable product foundation before adding marketplace complexity.
