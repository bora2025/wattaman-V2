# Gate E — Transactional email delivery

Date: 2026-08-29

## Result

The marketplace identity service now delivers account-verification and password-reset links through a provider boundary backed by SendGrid's HTTPS API. Production configuration fails closed when transactional email is disabled or when the selected provider lacks its API key/from address.

Raw tokens remain hashed in PostgreSQL, are omitted from production API responses, and are placed only in the intended recipient's HTTPS link. Delivery has a 10-second request timeout and up to three attempts for transport, HTTP 429, and server failures; permanent 4xx responses are not retried.

## Configuration

- `TRANSACTIONAL_EMAIL_PROVIDER=sendgrid`
- `SENDGRID_API_KEY`
- `TRANSACTIONAL_EMAIL_FROM`
- `PUBLIC_BASE_URL` supplies the HTTPS origin for verification and reset links.

## Verification

- Full marketplace API suite: 17 suites, 129 tests passed.
- TypeScript production build passed.
- Tests cover successful delivery, transient retry, permanent failure, production configuration fail-closed behavior, and verification-token delivery without returning the token in a production response.

## Remaining external evidence

Provider-domain authentication and delivery to a real mailbox must be verified in the deployed environment. E-006/E-011 also retain their deployed browser-journey requirement. Product/Legal approval remains outside engineering.
