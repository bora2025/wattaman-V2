# Gate B-014 — Mobile certification evidence (2026-08-31)

Status: **in progress**. Local engineering checks pass; signed builds and real-device journeys remain.

## Implemented

- Replaced the deleted hard-coded Railway API origin with configurable HTTPS school discovery.
- Discovery calls the public gateway's `/api/installation/status` and accepts only `installed` schools.
- School URL and installation identity are stored with Expo SecureStore; switching domains clears authentication credentials.
- Mobile sends `X-Wattanam-API-Version: 1`; the backend returns that compatibility version while retaining old paths for unversioned clients.
- Login, logout, refresh and authenticated calls use the selected school's `/api` gateway.
- Added core-backed password-reset requests from mobile; delivery uses the selected school's secure recovery workflow.
- Added explicit EAS preview targets for Android APK and iOS simulator.

## Verification run

| Check | Result |
|---|---|
| `apps/mobile: npm run typecheck` | pass |
| `expo export --platform android` | pass; 1,023 modules, Hermes bundle emitted |
| `expo export --platform ios` | pass; 1,024 modules, Hermes bundle emitted |
| `backend: npm run build` | pass; 213 files compiled |
| `backend: npm test -- --runInBand` | pass; 47 suites / 254 tests |
| `git diff --check` | pass |
| `expo-doctor` | pass; 20/20 after the SDK-55 patch alignment, square icon, and `expo-av` → `expo-audio` migration |
| `apps/mobile: npm audit --omit=dev --audit-level=high` | pass; 0 high/critical. Nine moderate Expo native-build-chain findings remain; npm's proposed forced fix would downgrade Expo 55 to 46 and was rejected |

## Required before `[x]`

1. Run the revised `mobile-compatibility.e2e-spec.ts` against a running seeded release database and retain its report.
2. Produce signed EAS preview/production artifacts for the supported Android/iOS matrix.
3. On real devices, record install/discovery/login, access-token refresh, offline timeout/recovery, school-domain change with credential clearing, and old-client behavior after a core upgrade.
4. Record device/OS versions, release commit and artifact identifiers so the result is reproducible.
5. Track the nine moderate Expo toolchain findings until an SDK-compatible upstream fix exists; do not apply npm's breaking Expo-46 downgrade.

Local Expo export proves the JavaScript application bundles for both platforms; it is not evidence of native signing, installation, push/camera permissions, or device network behavior.
