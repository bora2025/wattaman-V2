# ADR-0018: Communication Plugin Scope

Status: **Accepted** — approved by product owner **Bora** on 2026-09-11 for **LC0-011**.

## Context

Communication today is four separate things:

- **Announcements** are already an official plugin: `plugins/announcements` (`wattanam.announcements` 0.1.0, 15 capabilities, 3 namespaced migrations, English and Khmer). Its data was adopted from core in the C-004 cutover. `backend/src/announcements` is now a thin proxy for old URLs, and the legacy `Announcement` and `AnnouncementRead` tables are rollback data.
- **Direct messages** live in `backend/src/parent` (the messages controller, service and realtime gateway).
- **Posts** (`backend/src/posts`) are news content, which also feeds the public school homepage (`frontend/app/page.tsx:162`).
- **Daily and weekly digests** (`notification-preference/digest.service.ts`) count unread messages and announcements.

The lean-core plan's catalog puts all four in one Communication plugin, but it also says announcements "should be evolved into the Communication plugin or retained as a smaller standalone plugin through an explicit product decision; it must not be duplicated." Plugin IDs are immutable (plan section 9). Evolving `wattanam.announcements` into `wattanam.communication` therefore means adopting the same records a second time, this time plugin-to-plugin, which the migration toolkit does not cover.

## Decision

1. **`wattanam.announcements` stays a standalone plugin** under its current ID. It is not renamed, merged or duplicated.
2. **`wattanam.communication` owns direct messaging and posts**: messages, recipient rules, channel fan-out, the messaging realtime gateway, and news posts. The posts section of the public homepage becomes a Communication contribution to the core site shell.
3. **The marketplace sells both as a Communication bundle.** Schools see one purchase; the platform keeps two plugins.
4. **Core composes the digests from plugin sections.** Core keeps the digest schedule and preferences, and each plugin contributes its own section (unread announcements, unread messages) through a contribution contract. This replaces the manifest's current split, which moves the whole digest service to Communication.
5. **The realtime transport stays core** (the `user-<id>` rooms), and core's `realtime.notify` capability stops importing the messaging gateway (`plugin-realtime.service.ts:2`).

## Consequences

- Announcement data is not migrated a second time, and any school already running `wattanam.announcements` is untouched.
- A 13th owner, `wattanam.announcements`, joins the ownership manifest; the 46 provisional items split between it and Communication.
- The sidebar's unread badges (`Sidebar.tsx:161-162`) and the announcement feed on the student and teacher dashboards become contributions from two plugins, not one.

## Alternatives considered

- **Merge everything into `wattanam.communication`**, as the plan's catalog lists it. Customers see one plugin, but schools running announcements need a plugin-to-plugin adoption, and the C-004 extraction has to be redone.
- **Three plugins: Announcements, Messaging and Content (posts).** The cleanest separation, since posts serve the public website rather than internal communication, but a bigger catalog for a small feature. Worth revisiting if posts grow into a real website builder.

## Evidence from LC-1

- 46 provisional items: 2 modules, 3 models, 2 controllers, 13 routes, 4 pages, 2 navigation entries, 2 scheduled jobs (the digests), 1 plugin job, the official plugin itself, and 16 files.
- Split plan `notification-digests` (11 items): 7 core, 4 Communication.

## On acceptance

The manifest gains the `wattanam.announcements` owner. `plugins/announcements/` and the legacy announcement tables move to it, the `notification-digests` split is replaced by core composition (point 4), and the `LC0-011` references are removed.

## Related

[Lean-core plan section 8](../wattanam-lean-core-plugin-first-plan.md) · [Migration plan 4, 5.1](../module-to-plugin-migration-plan.md) · [C-004 announcements cutover](../../acceptance/gate-c-announcements-cutover-2026-08-28.md)
