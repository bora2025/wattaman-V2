# ADR-0014: Plugin Data Preservation

Status: **Proposed** — drafted 2026-09-11 for Gate LC-0 (**LC0-007**). Awaiting product-owner approval.

## Context

Removing a plugin already preserves its data. `PluginsService.remove` (`plugins.service.ts:194-207`):
- refuses an active plugin;
- deletes the registry row;
- unloads the code and deletes the artifact directory;
- returns `dataPreserved: true`, leaving the plugin's tables in place.

Everything around that is missing: no typed confirmation, no fresh backup at removal, no deliberate way to delete a plugin's data, and no documented adoption of preserved data on reinstall.

Under lean core the stakes rise. Without protection, uninstalling Attendance or Examination would become the easiest way to lose years of children's records, and 25 of the 82 models hold child data.

## Decision (proposed)

1. **Disable and uninstall preserve plugin data by default**: tables, settings, files and grant history.
2. **Deletion is a separate purge operation**, available only after uninstall and only to a SUPER_ADMIN. A purge requires:
   - the plugin ID typed as confirmation;
   - a fresh verified backup, taken immediately before;
   - an export, offered first;
   - an audit record naming who purged what.

   Purge respects legal retention holds (A-006).
3. **No plugin deletes data automatically at uninstall in Version 1.** The lean-core plan allows a manifest-declared deletion policy; this recommendation defers that until purge has run in production.
4. **Reinstall detects preserved data**, checks its schema version against the plugin's migrations, and offers adoption before activation.
5. **Commercial state never deletes data.** Neither an expired entitlement nor the billing lock deletes anything ([ADR-0016](./0016-billing-lock-and-plugin-entitlements.md)), and the owner's data-export right (DEC-001) stands throughout. What happens to data after a contract ends is set by the privacy policy's retention terms, not by the plugin lifecycle.

## Consequences

- A school that uninstalls a plugin expecting its data to disappear must also purge. The uninstall screen has to say so plainly.
- Preserved child data stays in the database and in every backup until it is purged, so the retention rules (A-006) must cover "uninstalled plugin data" explicitly.
- Storage grows with abandoned plugins; purge is the only way to reclaim it.

## Alternatives considered

- **Delete on uninstall, with an opt-out.** The common CMS behaviour, but one mistaken click destroys records schools are expected to keep.
- **Export then delete, as one step.** Tidier, but it ties an irreversible act to an export the school may never check. It can be added later on top of purge.

## Related

[Lean-core plan section 10](../wattanam-lean-core-plugin-first-plan.md) · [Migration plan principle 7](../module-to-plugin-migration-plan.md) · [data-classification.md](../data-classification.md) · [ADR-0006](./0006-licensing.md)
