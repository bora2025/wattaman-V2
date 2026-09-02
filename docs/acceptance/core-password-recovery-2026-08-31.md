# Core password recovery — implementation evidence (2026-08-31)

Status: repository implementation verified; production email delivery and live migrated-database journey remain release acceptance.

## Security contract

- `POST /auth/forgot-password` is throttled and always returns the same generic response, including for unknown accounts and delivery/configuration failures.
- A request invalidates prior active reset links and persists only a SHA-256 digest of a 256-bit random token.
- Links expire after 30 minutes and point to the installation's `PUBLIC_APP_URL` (falling back to its first exact CORS origin).
- `POST /auth/reset-password` validates a 64-character token and a minimum 12-character password.
- Confirmation atomically claims the link, hashes the new password with bcrypt cost 12, revokes all refresh sessions, and consumes every remaining reset link for the account.
- Both request and confirmation are audit logged. The browser has a public `/reset-password` form, and mobile can request a link against the selected school.

## Verification

| Check | Result |
|---|---|
| Password-reset service tests | 4/4 pass |
| Full backend suite | 48 suites / 258 tests pass |
| Backend build | pass; 216 files |
| Prisma schema validation | pass |
| Frontend production build | pass; `/reset-password` prerendered |
| Mobile TypeScript | pass |
| Expo Doctor | 20/20 pass |
| Android/iOS Expo exports | pass; 1,020 / 1,021 modules |

## Remaining production acceptance

Apply migration `20260831030000_add_password_reset_tokens`, configure `PUBLIC_APP_URL` and SendGrid, then retain a live journey proving delivery to a real mailbox, one-use enforcement, expiry rejection, successful login with the new password, and rejection of a pre-reset refresh token.
