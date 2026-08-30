# Wattanam V2 Platform Architecture

> For the complete delivery sequence, engineering work breakdown, acceptance gates, and operational plan, see [Platform Architecture: A-to-Z Delivery Plan](./platform-architecture-plan-a-to-z.md).

## 1. Vision

Wattanam V2 will be a self-hosted, extensible education platform similar in distribution model to Moodle or WordPress.

The platform should allow customers to:

- Install Wattanam on their own server or supported cloud provider.
- Own and control their database and uploaded files.
- Enable only the features they need.
- Install free or paid plugins.
- Receive compatible core and plugin updates.
- Back up, restore, and move an installation between supported hosts.

The first supported deployment model should be Node.js, PostgreSQL, and Docker on a VPS or compatible cloud platform. Supporting traditional PHP-only shared hosting is outside the initial scope because the current application uses Next.js, NestJS, and Prisma.

## 2. Architectural Principles

1. **Small, stable core:** The core contains only functionality required to operate and extend the platform.
2. **Features as modules or plugins:** School-specific capabilities should be independently installable where practical.
3. **No modification of core files:** Plugins extend the platform through documented APIs, hooks, and events.
4. **One installation per customer:** Each installation has an independent database, file storage, configuration, and plugin set.
5. **Secure by default:** All routes, plugin actions, updates, and downloads must be authenticated and authorized.
6. **Recoverable operations:** Installations and updates must support backups and safe failure recovery.
7. **Explicit compatibility:** Every plugin declares the core versions and dependencies it supports.

## 3. High-Level Architecture

```text
Wattanam Core
├── Authentication and authorization
├── Users and organizations
├── Roles and permissions
├── Global settings
├── Plugin manager
├── Event and hook system
├── Update manager
├── Migration runner
├── Audit logging
├── File storage abstraction
└── Administration dashboard

Official Plugins
├── Attendance
├── Courses
├── Exams and scoring
├── Fees and accounting
├── Payroll
├── Transportation
├── Parent portal
└── Notifications

Third-Party Plugins
└── Installed independently by each customer
```

### 3.1 Core Responsibilities

The core should own:

- Application startup and configuration.
- User identity and sessions.
- Role-based permission enforcement.
- Tenant or organization identity, if multi-organization installations are supported.
- Plugin discovery, activation, deactivation, and removal.
- Extension-point registration.
- Core and plugin migration execution.
- Update checks and package verification.
- Audit logs and platform health checks.
- Shared UI primitives and navigation registration.

Authentication, authorization, plugin management, and update management should not be removable plugins.

### 3.2 Plugin Responsibilities

A plugin may provide:

- Backend API routes and services.
- Frontend pages, widgets, and navigation entries.
- Database models and migrations.
- Roles and permissions.
- Scheduled jobs.
- Event subscribers.
- Notification channels.
- Reports, exports, and integrations.

A plugin must not directly edit core source files or another plugin's files.

## 4. Proposed Repository Structure

```text
wattanam-v2/
├── apps/
│   ├── web/                 # Next.js application
│   ├── api/                 # NestJS application
│   └── mobile/              # Expo application
├── packages/
│   ├── core/                # Shared platform contracts
│   ├── plugin-sdk/          # Plugin APIs and types
│   ├── ui/                  # Shared UI components
│   └── config/              # Shared build configuration
├── plugins/
│   ├── announcements/
│   ├── attendance/
│   └── courses/
├── infrastructure/
│   ├── docker/
│   ├── scripts/
│   └── templates/
├── docs/
├── docker-compose.yml
└── package.json
```

This is a target structure. Existing code should be migrated gradually rather than reorganized in one large change.

## 5. Plugin Contract

Each plugin should be self-contained:

```text
plugins/attendance/
├── plugin.json
├── backend/
├── frontend/
├── migrations/
├── permissions.ts
├── README.md
└── CHANGELOG.md
```

Example manifest:

```json
{
  "id": "wattanam-attendance",
  "name": "Attendance",
  "version": "1.0.0",
  "requiresCore": ">=1.0.0 <2.0.0",
  "author": "Wattanam",
  "license": "commercial",
  "backendEntry": "backend/index.js",
  "frontendEntry": "frontend/index.js",
  "permissions": [
    "attendance.read",
    "attendance.manage"
  ]
}
```

### 5.1 Extension Points

The plugin SDK should provide controlled APIs to:

- Register API routes.
- Register admin pages and navigation items.
- Register permissions and role defaults.
- Subscribe and publish domain events.
- Add dashboard widgets.
- Register scheduled jobs.
- Register notification providers.
- Register reports and export handlers.
- Run versioned database migrations.

Extension APIs should be versioned and documented. Internal core services should not automatically become public plugin APIs.

### 5.2 Plugin Lifecycle

```text
Download
   ↓
Verify signature and checksum
   ↓
Check core and dependency compatibility
   ↓
Back up database and configuration
   ↓
Install files
   ↓
Run migrations
   ↓
Activate plugin
   ↓
Run health check
```

Supported states should include `installed`, `active`, `inactive`, `update_available`, `incompatible`, and `failed`.

## 6. Installation Model

### 6.1 Docker Installation

Docker should be the primary production installation method. A release package should provide:

- Web application container.
- API application container.
- PostgreSQL service or support for an external PostgreSQL database.
- Persistent upload and backup volumes.
- Automatic migration command.
- Health checks.
- Backup and restore commands.
- A documented reverse-proxy and HTTPS configuration.

The intended basic experience is:

```bash
docker compose up -d
```

### 6.2 Web Setup Wizard

On the first visit, the application should guide the owner through:

1. Checking server requirements.
2. Accepting the license and terms.
3. Entering and testing database credentials.
4. Creating the database schema.
5. Creating the first administrator account.
6. Configuring school identity, locale, and timezone.
7. Configuring storage and email.
8. Writing protected installation configuration.
9. Locking the installer after successful setup.

Secrets must remain outside public web assets and must never be committed to Git.

### 6.3 Supported Environments

Initial support should focus on:

- Docker-compatible Linux VPS servers.
- Railway or similar Node.js platforms.
- DigitalOcean, AWS, Azure, or Google Cloud virtual machines.
- Managed PostgreSQL databases.

Traditional PHP-only shared hosting should not be advertised as supported.

## 7. Marketplace Architecture

The marketplace should be a separate central service. It should not share the database of any customer installation.

```text
Customer Installation
        ↓
Marketplace API
        ↓
Account, purchase, and license verification
        ↓
Signed plugin package download
        ↓
Local signature and compatibility checks
        ↓
Plugin installation and migration
```

The marketplace is responsible for:

- Developer and publisher accounts.
- Plugin listings and documentation.
- Versions and compatibility metadata.
- Free and paid downloads.
- Purchases and license entitlements.
- Signed release packages and checksums.
- Reviews and ratings.
- Security review status.
- Deprecation and removal notices.

The first release should use an official plugin repository. Third-party publishing and sales should be introduced only after the plugin SDK and review process are stable.

## 8. Commercial Licensing

Possible commercial model:

- Free or commercially licensed core platform.
- Essential official plugins included in a base edition.
- Advanced plugins sold individually or by subscription.
- Annual plans for updates and support.
- Revenue share on approved third-party plugin sales.

Recommended behavior for paid plugins:

- The installed plugin continues working after an update subscription expires.
- New downloads, updates, and support require an active entitlement.
- License results are cached locally.
- Temporary marketplace outages do not disable a school installation.
- A reasonable offline grace period is supported.

License enforcement must not place customer data at risk or unexpectedly make core school operations unavailable.

## 9. Security Requirements

The plugin and update system must include:

- Digitally signed release packages.
- Cryptographic checksums.
- Explicit plugin permission declarations.
- Authentication and server-side authorization for every protected operation.
- Core-version and dependency checks before installation.
- Database backup before migrations.
- Migration transactions where supported.
- Audit logs for installation, activation, update, and removal.
- Automated malware and dependency scanning.
- Manual review for marketplace publication.
- Emergency blocking of known vulnerable plugin versions.
- File upload validation and storage outside executable application paths.

A plugin ZIP must never be trusted or executed before its signature, contents, permissions, and compatibility have been validated.

## 10. Updates and Recovery

Core and plugin updates should be independent. Each update process should:

1. Check runtime and dependency compatibility.
2. Display release notes and migration requirements.
3. Create a database and configuration backup.
4. Enter maintenance mode when required.
5. Verify and install the signed package.
6. Run versioned migrations.
7. Rebuild or reload application assets.
8. Run health checks.
9. Leave maintenance mode after success.
10. Restore the previous version or provide a recovery command after failure.

Core and plugins should use semantic versions such as `1.2.0`. Plugin manifests must declare supported core-version ranges.

## 11. Data Ownership and Backups

Each customer installation owns:

- Its PostgreSQL database.
- Uploaded documents and media.
- Configuration and encryption secrets.
- Installed plugin data.
- Audit and operational logs.

The platform should provide:

- Scheduled database backups.
- File-storage backups.
- Encrypted downloadable backup archives.
- Restore verification.
- Retention settings.
- A documented server-migration process.

Plugin removal must clearly distinguish between deactivation, removal while preserving data, and permanent data deletion.

## 12. Delivery Roadmap

### Phase 1: Stabilize the Platform

- Define the minimum responsibilities of Wattanam Core.
- Move deployment-specific values into environment configuration.
- Document required services and supported environments.
- Add health, readiness, and version endpoints.
- Add reliable backup and restore commands.

### Phase 2: Distributable Installation

- Create production Docker images.
- Add `docker-compose.yml` and persistent volumes.
- Build the first-run web installer.
- Automate database migrations.
- Write installation, upgrade, and recovery documentation.

### Phase 3: Plugin Foundation

- Define and version the plugin manifest schema.
- Build the plugin SDK and event system.
- Implement plugin discovery and lifecycle management.
- Add compatibility and permission checks.
- Extract a small, isolated feature as the first plugin.

Announcements is a safer first extraction candidate than authentication, users, roles, or permissions.

### Phase 4: Updates and Official Repository

- Sign core and plugin packages.
- Implement update discovery and installation.
- Publish an official plugin repository API.
- Add release channels, changelogs, and compatibility metadata.
- Test rollback and disaster-recovery workflows.

### Phase 5: Commercial Marketplace

- Add customer and developer accounts.
- Add purchases and license entitlements.
- Add publisher review and approval workflows.
- Add ratings, reporting, and security notices.
- Define revenue sharing and marketplace terms.

### Phase 6: Third-Party Ecosystem

- Publish SDK documentation and example plugins.
- Provide local plugin development tools.
- Establish API deprecation policies.
- Add automated validation and security testing.
- Open marketplace submission to approved developers.

## 13. Immediate Next Decisions

Before implementation, confirm:

1. Whether the core will be open source, source-available, or proprietary.
2. Whether installations serve one school or multiple organizations.
3. Which database and storage providers are officially supported.
4. Which current features remain core and which become plugins. (Tracked as the master plan's DEC-004; a 2026-08-29 review found it outgrown by the real ~35-module backend against its ~10 named concepts — see `docs/decisions/product-owner-decision-brief-2026-08-29.md` and `docs/architecture/module-boundaries.md` for the current, evidence-backed classification.)
5. How plugin developers can access frontend and backend extension APIs.
6. Whether paid licenses are perpetual with optional updates or subscription-only.
7. What uptime and offline behavior is required for license validation.

## 14. Recommended First Milestone

> Historical architecture recommendation: this installable-core milestone is now verified. Use the [master execution plan](./platform-master-execution-plan.md) for current work.

The first milestone should deliver a repeatable Docker installation of the existing application with:

- No hard-coded customer configuration.
- A first-run administrator setup flow.
- Automated migrations.
- Persistent database and file storage.
- Backup and restore commands.
- Version and health reporting.

The plugin marketplace should begin only after this distributable base installation is reliable.
