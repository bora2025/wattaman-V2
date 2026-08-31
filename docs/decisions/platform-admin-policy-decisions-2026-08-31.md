# Platform Admin Policy Decisions

Status: **approved**  
Decision date: 2026-08-31  
Applies to: PA-3, PA-5, and PA-6 of the platform-admin delivery plan

These decisions adopt the plan's recommended security posture and unblock implementation. They
may be tightened later, but weakening dual control, build isolation, or school installation
consent requires a superseding reviewed decision.

## PA0-4 — Two-person approval

The requester/initiator and final approver must be different named, MFA-verified operators for:

- publisher identity verification;
- publisher signing-key approval, revocation, or emergency replacement;
- stable publication or promotion of third-party plugin releases;
- stable core-release promotion;
- publisher revenue-ledger corrections;
- publisher payout approval and payout completion (completion also requires a payment reference);
- refunds above USD 500 equivalent, measured using the recorded order currency and the approved
  Finance conversion procedure;
- manual entitlement grants longer than 90 days, or any manual grant for a paid plugin without a
  settled order;
- production signing-key rotation and trust-anchor removal.

An emergency security withdrawal may be executed by one Security Reviewer because delay can harm
schools. It creates an immutable incident record and requires retrospective second-person review
within one business day. Dual control never means sharing an operator account.

## PA0-5 — School plugin requests

Approved request types and service targets:

| Type | Initial response | Decision target | Notes |
|---|---:|---:|---|
| `FREE_APPROVAL` | 1 business day | 2 business days | Controlled free catalog plugin |
| `PURCHASE_ASSISTANCE` | 1 business day | 2 business days | Finance/payment completion may extend fulfilment |
| `PRIVATE_PLUGIN_ACCESS` | 1 business day | 3 business days | Requires publisher/contract scope verification |
| `TRIAL` | 1 business day | 1 business day | One trial per installation/plugin unless exception approved |
| `FEATURE_REQUEST` | 2 business days | No delivery promise | Product feedback only; never creates an entitlement |

Trial policy:

- 30 calendar days;
- one trial per installation/plugin in a rolling 365-day period;
- no automatic conversion or charge;
- trial expiry never deletes school data;
- extensions up to 14 days require a Marketplace Operator reason; longer extensions follow the
  manual-entitlement dual-control rule.

Price authority:

- catalog price is the default;
- Finance Operator may approve a discount up to and including 10%, with a reason;
- discounts above 10% require a different Platform Owner as second approver;
- no override may reduce price below a configured publisher/contract floor;
- every override stores original price, final price, currency, reason, actor, and approval chain;
- paid entitlement activation requires settled payment unless the approved two-person manual
  entitlement exception applies.

Platform approval grants access or entitlement eligibility only. The school administrator still
downloads, verifies, installs, and activates the plugin locally.

## PA0-6 — Hosted plugin builds and signing custody

Build network policy:

- each build runs in a fresh disposable container or microVM;
- outbound network is denied by default;
- dependency retrieval, when required, goes only through an allowlisted read-only package proxy;
- no route exists to marketplace PostgreSQL, Railway control APIs, customer networks, production
  storage, operator sessions, payment secrets, or signing keys;
- CPU, memory, process, filesystem, artifact-size, and wall-clock limits are mandatory;
- source is an immutable commit SHA with a lockfile; mutable branch names are never build inputs.

Evidence retention:

- approved/released build provenance, SBOM, checks, toolchain digest, and signing record: release
  lifetime plus 7 years;
- rejected build reports: 1 year;
- failed/cancelled build logs: 90 days;
- quarantined malicious artifacts: 30 days unless Security places a legal/incident hold;
- secrets detected in logs are redacted before persistence; retention never justifies storing a
  discovered secret.

Signing custody:

- build workers never receive signing private keys;
- production release signing uses a separate private service backed by non-exportable KMS/HSM
  keys when the selected provider supports it;
- signing accepts an approved artifact digest, never arbitrary source or a mutable URL;
- stable release signing/promotion follows PA0-4 dual control;
- development, staging, beta, production metadata, entitlement, and publisher signing keys are
  distinct;
- key rotation uses an overlap window and witnessed trust-anchor drill before old-key removal.

## Review triggers

Review this decision before changing launch jurisdiction/currency, opening public publisher
registration, permitting hosted third-party source builds, changing the payment provider, or
moving production signing custody.
