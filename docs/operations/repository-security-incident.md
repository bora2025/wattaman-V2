# Repository Security Incident Runbook

## Compromised plugin release

1. Security opens an incident, records affected plugin/version ranges, severity, reporter, and evidence, and freezes related publication.
2. An operator calls `POST /admin/v1/plugin-releases/withdraw`. The transaction withdraws the release, records a `WITHDRAWN` review, and publishes the advisory together; existing artifact bytes are never replaced.
3. Set advisory action to `WARN`, `DISABLE`, or `EMERGENCY_DISABLE` and include an HTTPS customer-communication URL. Use emergency disable only where continued execution creates material risk.
4. Schools verify the signed advisory locally. `POST /updates/advisories/apply-emergency` deactivates affected installed plugins without uninstalling them or deleting their files, settings, migrations, or business data.
5. Notify customers through the status page, email/support channels, and the advisory URL. State impact, affected versions, safe workaround, data-access behavior, fixed version, and next update time.
6. Publish a separately reviewed higher version; do not unwithdraw or replace the compromised bytes.

## Compromised repository key

Stop publication, preserve evidence, and follow the emergency procedure in [repository-key-custody-and-rotation.md](./repository-key-custody-and-rotation.md). Existing schools continue operating with installed code while updates fail closed. Distribute a replacement public key through an already trusted core or verified out-of-band support channel. Never disable signature verification.

## Tabletop exercise — 2026-08-28

Scenario: a signed official plugin is reported to exfiltrate data, and investigators also suspect the active repository key.

Expected and exercised decisions:

- Publication is frozen; the plugin release is atomically withdrawn, reviewed as withdrawn, and paired with a signed `EMERGENCY_DISABLE` advisory and customer URL.
- The school applies only a valid signed advisory, deactivates the matching plugin, preserves its data, and records the result. Tampered metadata is rejected.
- A repository outage during containment does not affect login or installed school functionality. Update discovery retries with a bounded timeout.
- Security rotates the repository key with two-person approval. Old/new overlap supports already deployed clients; the old private key is removed after the migration window.
- Recovery uses a fixed higher plugin version and immutable new digest, never overwritten bytes. Support communicates status and recovery steps until closure.

Automated repository and school tests cover the atomic withdrawal/advisory/review transaction, emergency deactivation without destructive removal, tampered signatures, replay/downgrade rejection, corrupt artifacts, and slow/unavailable repository behavior.
