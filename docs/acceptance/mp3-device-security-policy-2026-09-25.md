# MP3 device security policy — 2026-09-25

Result: **local policy implementation verified; physical-device certification remains MP3-014**

The unified Attendance Manager scan command now enforces server-side policy before resolving a
student identifier or opening a write transaction:

- the route still requires the plugin's `scan` permission, and additionally accepts only school
  operator roles (`SUPER_ADMIN`, `SCHOOL_ADMIN`, `ADMIN`, `TEACHER`, `CLASS_ADMIN`, `WATTAMAN`);
- `schoolTimezone` is an IANA timezone plugin setting, defaulting to `Asia/Phnom_Penh`; the server
  derives the attendance date and local time from the captured timestamp in that timezone;
- `futureToleranceMinutes` defaults to 5 and is capped at 60;
- `maxOfflineMinutes` defaults to 1,440 and is capped at 10,080;
- invalid, future-skewed or stale offline timestamps fail before mutation;
- the server selects a configured active student session for the class/local time and rejects
  caller-supplied sessions outside that window;
- configured holidays reject scanning;
- scan status and check-in time are server-derived rather than trusted from the client;
- duplicate commands are serialized and resolved by the idempotency ledger documented under
  MP3-006.

Focused tests cover unauthorized roles, stale and future clocks, inactive sessions, holidays,
accepted scans and idempotent replay. Package validation confirms the required `settings.read`
capability is declared.

```text
npm test -- --runInBand src/plugins/attendance-manager-plugin-source.spec.ts
PASS: 6 tests

node packages/plugin-cli/bin/cli.js check plugins/wattanam.attendance-manager
ALL CHECKS PASSED
```

This closes MP3-007 at implementation scope. Camera, QR/card and USB behavior on actual hardware is
separately required by MP3-014.
