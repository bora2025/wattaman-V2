# WordPress-style update and rollback UX evidence

Date: 2026-09-25  
Scope: plugin update review and artifact rollback controls

## Update decision

The signed repository index now feeds the Plugin Manager a bounded update disclosure containing the
new version's capabilities, permissions, required/optional dependencies, migration risk and data
retention policy. **Review & update** requires explicit confirmation and sends the disclosure digest.
The update service recomputes that digest from the signed release before downloading bytes, so stale
or bypassed consent fails closed.

Active plugins must still be deactivated before replacement. Package signature, checksum, core
compatibility and dependency verification continue behind the consent gate.

## Rollback decision

The installed-plugin response now reports `rollbackAvailable` from the artifact rollout registry.
The UI offers **Roll back** only when a previous healthy generation exists. Confirmation states that
the current plugin data is retained. The existing rollback operation unloads the current runtime,
atomically reactivates the prior artifact/manifest generation and reloads the plugin.

## Verification

- `backend/src/updates/updates.service.spec.ts` verifies public update disclosure and the signed
  package pipeline with a valid consent digest.
- `backend/src/marketplace/plugin-install-consent.spec.ts` proves canonical consent and invalidation
  on authority/migration-risk changes.
- `backend/src/plugins/plugins.service.spec.ts` and the rollout service cover lifecycle behavior.
- `tools/plugin-lifecycle-ux-contract.test.js` prevents removal of consent, dependency, retention and
  rollback controls.
- the physical lean-core frontend production build type-checks and renders the updated Plugin
  Manager route.

Hosted multi-process rollback certification remains part of `LCF-008`; this document records the
implemented local product contract and does not claim hosted certification.
