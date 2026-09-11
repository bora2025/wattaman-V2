# Wattanam clean core database schema design

Status: **Accepted for LC2-014** on 2026-09-11. This document defines the implementation boundary;
LC2-015 and LC2-016 must prove it on a disposable database before production defaults change.

## 1. Decision

Wattanam will maintain two explicit database lineages during the supported migration window:

| Lineage | Schema and migrations | Used by |
|---|---|---|
| `wattanam-core-v1` | `backend/prisma/core/schema.prisma` and `backend/prisma/core/migrations/` | New, explicitly core-only installations |
| `wattanam-legacy-v1` | Current `backend/prisma/schema.prisma` and `backend/prisma/migrations/` | Every existing school and `legacy-full` installation |

The paths describe the LC2-015 implementation target; they are deliberately not populated by
copying the current schema. The existing schema is a compatibility schema, not a core template.

## 2. Core model boundary

The authoritative set is machine-readable in [core-schema-contract.json](./core-schema-contract.json)
and must exactly equal models owned by `lean-core` in
[ownership-manifest.json](./ownership-manifest.json). It currently contains 21 models covering:

- generic accounts, sessions and password recovery;
- audit, notifications and preferences;
- installation and site identity;
- plugin registry, migrations, settings, jobs, permissions, quotas and entitlements;
- marketplace registration, linking, billing control and recovery.

Plugin business tables are created only by signed, namespaced plugin migrations and tracked in
`PluginMigration`. They never enter the core Prisma migration history.

## 3. Identity split required before generation

The legacy `User` model is not reusable in a clean core schema. It has cross-owner relations to 21
business fields, plus the scalar `departmentId`. LC2-015 must produce the core account model by
removing every field named in `identityFieldSplits`. Generic relations to refresh tokens, password
reset tokens, core notifications and notification preferences remain.

Plugin profiles refer to the immutable core user ID through their own columns and contracts. Core
does not add Prisma relations back to plugin tables. Deleting a user publishes a durable lifecycle
event; plugin cleanup follows its retention policy rather than a cross-schema cascade.

`NotificationPreference.announcementsEnabled` and `messagesEnabled` are compatibility columns in a
core-owned table. They may remain nullable/unused during LC-2, but new plugin-specific preferences
must use plugin settings; no new business-specific preference column may be added to core.

## 4. Migration selection and lineage safety

Migration choice happens before Prisma migration deploy:

1. An empty database may be initialized with the explicitly requested lineage.
2. Each baseline writes a durable lineage marker containing lineage, schema version and timestamp.
3. A non-empty database without a recognized marker is treated as legacy and requires an explicit
   adoption preflight; it is never guessed to be core.
4. Runtime distribution must be compatible with the stored lineage. `legacy-full` cannot run on a
   core lineage. A legacy database may temporarily run core composition during staged cutover, but
   it remains physically legacy and is not certified as a clean core database.
5. Changing `WATTANAM_DISTRIBUTION` never runs table drops or switches migration directories.
6. A migration command must abort before writes when requested and stored lineages disagree.

The core and legacy migration directories use independent immutable histories. Migration names are
never copied between them after release, and neither history edits an already-applied migration.

## 5. Existing-school preservation

Existing schools remain on `wattanam-legacy-v1`. Each plugin wave follows expand, backfill, verify,
switch, and only later retire:

1. Install namespaced plugin tables without changing legacy data.
2. Backfill through the journaled adoption toolkit.
3. Reconcile rows, relationships, timestamps, files and monetary totals.
4. Switch API/UI ownership only after verification; retain legacy tables as rollback data.
5. Remove legacy tables only after the published rollback and support window closes, using an
   separately approved destructive migration.

There is no in-place command that converts the full legacy schema into the clean core schema.
Moving a legacy school to a physically clean database requires verified backup/export, restore into
the matching lineage, plugin adoption, reconciliation and explicit operator approval.

## 6. Client and runtime rule

LC2-015 introduces a core Prisma schema/client and a legacy Prisma schema/client behind the database
adapter. Core modules may compile against core-owned delegates only. Plugin runtime SQL stays
namespace-restricted. During transition the legacy client may remain for `legacy-full`, but a clean
core boot test must fail if core source adds an optional business delegate or relation.

API and worker startup must validate lineage before any scheduled handler or plugin activation.
Readiness reports a mismatch as not ready; it must not silently fall back to the other schema.

## 7. Backup, restore and operations

- Backups record the database lineage, core version, installed plugin registry and migration state.
- Restore requires the matching core/legacy application artifact and validates lineage before writes.
- Core backups include all installed plugin namespaces; uninstall preserves plugin data by default.
- Marketplace, billing lock, audit, health and recovery work with zero plugin tables.
- Monitoring identifies lineage and distribution without exposing credentials or school data.

## 8. Rejected approaches

- **One full schema with unused tables:** fails the requirement that a clean install contain no
  optional business schema.
- **Conditional SQL inside one Prisma migration history:** Prisma records migrations globally and
  would make database state depend on deployment-time environment values.
- **Drop business tables when selecting `core`:** destroys rollback data and breaks existing schools.
- **Copy only the 21 current model blocks:** fails because `User` still references business models.
- **Let plugins add relations to core models:** recreates compile-time coupling and unsafe cascades.

## 9. LC2-015 implementation gate

LC2-015 may begin only from this contract and must deliver:

- a valid core schema containing only the approved closed model graph;
- an immutable core baseline and durable lineage marker;
- distribution/lineage preflight before migrations and runtime boot;
- separate generated client/adapter boundaries;
- API and worker boot on a fresh disposable PostgreSQL database;
- a negative test proving an optional business table can be absent and never queried.

