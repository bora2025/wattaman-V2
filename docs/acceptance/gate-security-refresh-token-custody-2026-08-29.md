# Security acceptance — core refresh-token custody

Date: 2026-08-29

## Result

Core refresh tokens are no longer stored in plaintext. New sessions persist a unique SHA-256 digest and return the random 320-bit bearer value only to the client. Rotation atomically consumes the presented row and creates a new token. Presenting a consumed or expired token revokes every still-active refresh token for that user and fails authentication.

The migration deliberately retains a nullable legacy `token` column so a session issued before deployment can be accepted once and converted to digest-only storage during rotation. New code never writes that column. It can be removed in a later compatibility migration after the maximum configured refresh-token lifetime has elapsed.

## Evidence

- Focused custody tests: 3/3 passed.
- Full backend suite: 45 suites, 231 tests passed.
- TypeScript typecheck and 210-file production build passed.
- All nine migrations applied to disposable PostgreSQL 16.
- `npm run certify:refresh-tokens` passed against that database and proved:
  - plaintext absent at rest;
  - a 64-character SHA-256 digest present;
  - rotation issued a different token;
  - reuse was rejected;
  - reuse left zero active sessions for the user.

The disposable database container was removed after the drill.
