# Repository and Publisher Key Custody

## Separation and custody

Publisher and repository keys are independent Ed25519 key pairs. Publisher keys sign the package checksum manifest; repository keys sign the canonical update index. Entitlement keys are a third trust domain. Never reuse a private key between these roles.

Production private keys stay outside Git, build contexts, images, database rows, logs, and school projects. Store the primary encrypted copy in the production secret manager and an encrypted offline recovery copy under separate custody. Schools receive public keys only. Record each key ID, SHA-256 public-key fingerprint, purpose, custodian, creation date, activation date, review date, and revocation date in the restricted key register.

Creating, activating, exporting, revoking, or destroying a production private key requires two approvals from three eligible roles: Security, Release Engineering, and Platform Operations. One person performs the change and the second verifies the public-key fingerprint and resulting signed metadata. A publisher cannot approve its own repository trust-anchor change.

## Planned repository-key rotation

1. Security generates the replacement offline and records its fingerprint. Do not copy the private key to a school.
2. Two eligible approvers compare the recorded public key and fingerprint.
3. Ship the replacement public key to schools through an already trusted core release and add it to `UPDATE_REPOSITORY_PUBLIC_KEYS_JSON`. Keep the old key trusted.
4. Configure the marketplace replacement as `METADATA_SIGNING_KEY_ID`/`METADATA_SIGNING_PRIVATE_KEY`, and configure the prior key through `METADATA_SECONDARY_SIGNING_KEYS_BASE64`. The value is base64-encoded JSON mapping old key IDs to private PEM strings; use this transport for multiline secrets on Railway.
5. Deploy, fetch `/v1/index`, canonicalize `payload`, and verify one signature with each public key. Confirm a school trusting only the old key and a school trusting the new key both accept the index.
6. Observe the supported-client migration window. Do not remove the old signature until every supported school release trusts the replacement.
7. Remove the secondary private key, verify new-only metadata, revoke the old key in the restricted register, and retain its public key and audit evidence.

Publisher-key rotation follows the same overlap principle: register the replacement public key, publish newly reviewed packages with it, update school publisher trust stores, then revoke the old publisher key. Existing immutable packages and signatures remain available for audit.

## Emergency revocation

Stop publication immediately. Preserve logs, database, artifacts, current public keys, and suspect signatures. Obtain two-of-three approval for a new key, distribute its public key out of band through a trusted core/security channel, and only then resume new-key signing. Publish an incident advisory with a support URL. Never bypass verification or treat TLS as a replacement trust anchor.

## 2026-08-28 production rotation drill

The Railway production repository changed its active key from `repository-2026` to `repository-2027` and retained `repository-2026` as a secondary signer. Deployment `12c37fb6-141e-4b3f-9bd4-b6787bf67f08` reached `SUCCESS`. The live stable index contained two Ed25519 signatures; independent verification using each public key returned true. The active signature was `repository-2027`. The published announcements package still downloaded successfully and matched SHA-256 `0631472c2d32e7dcc8bf7ed5b3286f3ec7b6e2325fb037c2943e1ae10f831c75`.

The drill also confirmed fail-closed behavior: malformed overlap-secret deployments failed configuration validation rather than emitting unsigned or ambiguously signed metadata. The service was restored with the valid active key, then redeployed using the base64 overlap transport.
