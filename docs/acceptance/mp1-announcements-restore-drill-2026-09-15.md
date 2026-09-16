# MP-1 Announcements Restore Drill Evidence

Date: 2026-09-15
Status: complete
Wave: MP-1 low-coupling proof

## Goal

Run a live backup and clean-restore drill with announcements recertification context.

## Execution summary

Executed from backend workspace using disposable PostgreSQL source and restore targets.

Output artifact:

- `docs/acceptance/mp1-announcements-restore-drill-2026-09-15.json`

Result metrics:

- `passed`: true
- `identity.exactMatch`: true
- `rto.measuredSeconds`: 3.217
- `rto.withinTarget`: true (target 14,400 seconds)
- `reportSha256`: `afe27fc9c0fd6fb0ffc01023fa76cad3d470f62aa641fe93f9d07215b640af44`

Environment preparation and execution notes:

- detect docker and psql availability;
- run disposable PostgreSQL source and restore targets;
- add PostgreSQL 16 tools to PATH for `pg_dump` and `pg_restore`;
- seed a minimal source table required by snapshot credential checks (`User`);
- execute `node scripts/backup-restore-drill.js --out ../docs/acceptance/mp1-announcements-restore-drill-2026-09-15.json`.

Observed results:

- Docker CLI: available.
- Docker daemon: available (`desktop-linux`).
- PostgreSQL client tools available via `C:\Program Files\PostgreSQL\16\bin`.
- Drill report JSON created successfully.

## Blocker resolution

- Blocker ID: MP1-BLK-001
- Owner: Platform/SRE
- Opened: 2026-09-15
- Resolved: 2026-09-15
- Resolution: Docker daemon became available and PostgreSQL tools were installed, then the live drill completed with a passing report.

## Next action

1. Reference this report in MP-1 announcements recertification evidence.
2. Complete remaining MP-1 items: clean-core marketplace install run and API/worker digest parity capture.

## Windows unblock commands used

Run in PowerShell:

```powershell
Start-Process "$Env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
winget install --id PostgreSQL.PostgreSQL -e
```

Validate prerequisites:

```powershell
docker info
psql --version
```

When both succeed, run the drill:

```powershell
cd backend
node scripts/backup-restore-drill.js --out ../docs/acceptance/mp1-announcements-restore-drill-2026-09-15.json
```
