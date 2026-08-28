# Gate C Plugin Notification Adapter Evidence — 2026-08-28

## Result

Plugins can now send email and SMS through the same core `NotificationService` the application already uses for absence notifications and announcements, gated by a new `notifications.send` manifest capability. This closes the "notification adapter" half of C-003; the "audit adapter" half was closed separately the same day (see [gate-c-plugin-permission-audit-2026-08-28.md](./gate-c-plugin-permission-audit-2026-08-28.md)).

## What changed

- `PLUGIN_CAPABILITIES` gained `notifications.send`.
- `PluginRuntimeContext.notifications` (SDK 1.0): `sendEmail(to, subject, text)` and `sendSms(to, body)`, matching `NotificationService`'s existing generic dispatchers exactly — no new provider logic, no new credentials, no plugin-specific SendGrid/Twilio wiring.
- `PluginRuntimeService` injects the real `NotificationService` and gates both methods behind `requireCapability('notifications.send')`, the same pattern already used for settings/storage/jobs/events/routes/permissions/navigation.
- `PluginsModule` now imports `NotificationModule` to receive it.

## Design choices and why

- **No new send path.** A plugin calling `context.notifications.sendEmail(...)` runs through the identical `NotificationService.sendEmail` used elsewhere in the app today — same provider config, same graceful `{skipped: true, reason: 'no-api-key'}` behavior when SendGrid/Twilio aren't configured, same failure behavior. There is nothing plugin-specific to misconfigure.
- **No audit log entry for a send.** The core notification pathway (`sendAbsenceNotification`, `sendEmail`, `sendSms`) does not write to `AuditLog` today either — only to the `Notification` table in one specific case. Adding audit logging only for the plugin path, with recipient PII redaction rules invented for this change alone, would create an inconsistency between how core and plugin code send the exact same message through the exact same function. That is intentionally left for a follow-up that addresses notification auditing everywhere at once, not just for plugins.
- **Capability-gated, not permission-gated.** Like settings/storage/jobs, this is a capability a plugin's own backend code uses internally (e.g., inside a job handler or event subscriber) — there is no HTTP caller/principal to check a permission grant against, so it uses the existing capability-declaration mechanism rather than `PluginPermissionsService`.

## Automated verification

```text
Full backend suite: 23 passed, 23 total (92 tests, +2 from this change)
Backend build (swc): 159 files compiled
TypeScript build: passed (tsc --noEmit)
```

New coverage: a plugin that declares `notifications.send` and calls `sendEmail` receives the exact response the injected `NotificationService` stub returns, and the stub is called with the plugin's exact arguments; a plugin that does not declare the capability is rejected before the core service is ever called.

## Open items

- No audit trail exists for any notification send, core or plugin-triggered. If this is required before Gate C closes, it should cover both paths in one change so behavior stays consistent.
- No rate limiting or per-plugin sending quota exists; a misbehaving or compromised plugin with the capability could send unbounded email/SMS through the school's configured provider credentials. Consider this alongside the C-007 malicious-fixture review before any plugin ships with this capability declared.
