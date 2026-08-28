# Phase A Notification Adapter Evidence — 2026-08-28

Scope: A-008 provider configuration and redaction increment.

Verified invariants:

- Email and SMS adapters remain fully optional; an unconfigured school starts normally.
- SendGrid sender and key shape validate before listening.
- Twilio SID, token, and sender must be supplied atomically.
- Twilio SID and E.164 sender shapes validate before listening.
- Notification delivery consumes the validated configuration rather than reading environment variables per request.
- Operational status exposes only enablement and sender identity, never provider secrets.
- Absence and generic email delivery share the configured sender rather than a hidden hard-coded sender.

Verification:

```text
npm.cmd test -- --runInBand
20 suites passed; 69 tests passed

npm.cmd run build
Successfully compiled 154 files with SWC
```

Remaining A-008 evidence: identify the production secret custodian, rotation schedule, emergency revocation procedure, and Railway/Compose injection method for every secret class.
