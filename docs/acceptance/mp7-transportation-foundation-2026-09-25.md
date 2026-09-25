# MP-7 Transportation foundation — local acceptance evidence

Date: 2026-09-25

Status: local foundation accepted; production certification remains open.

- Five immutable namespaced migrations validate through the plugin migration policy.
- The package has no foreign keys to core or other plugin tables.
- Driver identities are validated through the Directory capability.
- Coordinates, speed, heading, capacity and lifecycle status are bounded.
- Location persistence is transactional and realtime publication occurs after commit.
- Rider assignments accept only current Academic roster members and store stable identifiers.
- Parent tracking derives owned children from dated rosters and exposes only their assigned vehicles.
- Route and stop updates/deletes are permission-gated; assigned routes cannot be deleted.
- Every declarative UI data source maps to a runtime route with the identical permission.

```text
Transportation focused suites: 11 passed, 0 failed
Backend build: 311 files compiled
```

This does not prove real PostgreSQL execution, hosted parent-session behavior, map/device behavior,
restored-backup adoption, hosted lifecycle, or pilot readiness.
