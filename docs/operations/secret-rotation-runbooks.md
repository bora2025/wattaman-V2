# Secret Rotation Runbooks

Closes the gap `docs/operations/secrets-inventory.md` names directly: "No rotation drills
exist for most secrets." Every secret in that inventory gets a concrete procedure here —
"restart the process during a maintenance window and accept the impact" is itself a valid,
stated procedure where no graceful overlap mechanism exists; it's written out explicitly
rather than left as "no procedure exists."

## Secrets with a real overlap window (rotate without an outage)

### Repository signing key (`METADATA_SIGNING_PRIVATE_KEY`, marketplace)

Already has a live-drilled procedure — see
[gate-d-official-repository-2026-08-28.md](../acceptance/gate-d-official-repository-2026-08-28.md)'s
`repository-2026`/`repository-2027` overlap drill. Summary: add the new key to
`METADATA_SECONDARY_SIGNING_KEYS_JSON` alongside the current primary, wait until every
client has fetched at least one index signed with (or now trusting) the new key, promote the
new key to `METADATA_SIGNING_PRIVATE_KEY`, keep the old one in the secondary set until no
client depends on it, then remove it.

### Entitlement signing key (`ENTITLEMENT_SIGNING_PRIVATE_KEY`, marketplace)

The verification side (`backend/src/marketplace/entitlement-config.ts`) already supports
multiple trusted public keys via `ENTITLEMENT_SECONDARY_PUBLIC_KEYS_JSON` — this exists today
and is unit-tested (`entitlement-config.spec.ts`). The *issuing* side
(`apps/marketplace-api/src/config.ts`) only signs with one key at a time; there is no
`entitlementKeys` array the way `signingKeys` exists for the repository key. That asymmetry is
exactly why this rotation has never been drilled even though the primitive to verify overlap
exists. Procedure, using what's actually there today:

1. Generate the new Ed25519 keypair. Export its public half.
2. On every school's `backend`, add the new public key to
   `ENTITLEMENT_SECONDARY_PUBLIC_KEYS_JSON` (keyed by the new key's ID) **before** touching the
   marketplace. Redeploy/restart `backend` — this makes every school able to verify tokens
   signed by *either* key, verified by `entitlement-config.spec.ts`'s multi-key tests.
3. Confirm propagation: every active installation has picked up the new trusted key (there is
   no push mechanism for this — it's a config change on each school's own deployment, so this
   step is manual verification, not automated).
4. On the marketplace, swap `ENTITLEMENT_SIGNING_PRIVATE_KEY`/`_KEY_ID` to the new key and
   redeploy. Every entitlement issued from this point signs with the new key.
5. Wait out the longest `offlineRecheckAfter`/`expiresAt` window on any entitlement issued
   under the old key (up to the license's full term — offline verification of an
   already-issued token must keep working per E-010's own "an outage or expiry must never
   disable functionality a school already has" invariant, so the old key cannot be pulled
   just because the marketplace stopped issuing with it).
6. Once no unexpired entitlement was signed by the old key, remove it from every school's
   `ENTITLEMENT_SECONDARY_PUBLIC_KEYS_JSON`.

Live-drilled below (see Verification) — issue under the old key, rotate, issue under the new
key, confirm both verify during overlap, confirm the old key alone stops working after removal,
mirroring the repository-key drill exactly.

### `IDENTITY_ENCRYPTION_KEYS_JSON` (marketplace, protects `mfaSecret` at rest)

Self-healing by design, and live-verified end to end in this pass (see Verification below):
`parseSecretEncryptionKeys()` accepts a keyring plus one designated active key;
`decryptSecret()` can decrypt a value encrypted under *any* key still present in the ring and
reports `needsRotation: true` whenever the key that decrypted it isn't the active one;
`identity.service.ts#verifyMfaFactor` re-encrypts under the active key automatically the next
time a user completes a successful TOTP login whenever `needsRotation` is true — no
bulk-migration script needed.

1. Generate a new 32-byte key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
2. Add it to `IDENTITY_ENCRYPTION_KEYS_JSON` under a new key ID, **keeping the old key in the
   object too** — do not remove it yet.
3. Set `IDENTITY_ENCRYPTION_ACTIVE_KEY_ID` to the new key's ID. Redeploy.
4. Every `mfaSecret` still encrypted under the old key keeps decrypting correctly (the old key
   is still in the ring) and gets transparently re-encrypted under the new key the next time
   its owner logs in with a TOTP code.
5. Wait long enough that essentially every MFA-enabled account has logged in at least once
   (there is no way to force this — it's opportunistic, tied to real logins, not a scheduled
   job). Optionally, run a one-off script instantiating `IdentityService` directly against
   production data to proactively re-encrypt every row still under the old key, rather than
   waiting on organic logins, if the rotation needs to close sooner.
6. Once confirmed (e.g. `SELECT COUNT(*) FROM "MarketplaceAccount" WHERE "mfaSecret" LIKE 'enc:v1:<old-key-id>:%'` returns 0), remove the old key from
   `IDENTITY_ENCRYPTION_KEYS_JSON` entirely and redeploy again.

### `JWT_SECRET` (backend)

Previously a hard cutover — rotating it signed out every logged-in user instantly, since the
token carried no key id a verifier could use to tell an old secret from a new one. That's now
fixed: every issued token's header is tagged with the id of the secret that signed it
(`JWT_KEY_ID`, default `jwt-v1`), and the verifier (`src/auth/jwt-verification.ts`, wired into
both the HTTP `JwtStrategy` and the WebSocket gateways' `socket-auth.ts`) trusts the active
secret plus anything listed in `JWT_SECONDARY_SECRETS_JSON` — an id-keyed JSON object, the same
shape already used for the repository and entitlement secondary keys. A token with no `kid` at
all (issued by a pre-rotation binary) still verifies against the active secret, so upgrading to
this mechanism itself needs no special handling.

1. Generate a new secret (≥32 random characters) and choose a new key id, e.g. `jwt-v2`.
2. Set `JWT_SECONDARY_SECRETS_JSON={"jwt-v1":"<the current JWT_SECRET value>"}` **before**
   changing anything else, so the old secret is already trusted once the switch happens.
3. Set `JWT_KEY_ID=jwt-v2` and `JWT_SECRET=<the new secret>`. Redeploy. Every newly issued token
   now signs with the new secret and carries `kid: jwt-v2`; every token issued before the
   redeploy (`kid: jwt-v1` or no `kid` at all) keeps verifying, since `jwt-v1` is still trusted.
4. Wait out the longest-lived token issued under the old secret — the refresh token's lifetime
   (`JWT_REFRESH_EXPIRY`, default 7 days), not just the shorter access-token lifetime, since a
   refresh exchange still needs the old access token's session context to remain valid until the
   refresh itself is exchanged for a new pair signed under the new key.
5. Once no unexpired token could still be signed under the old secret, remove
   `JWT_SECONDARY_SECRETS_JSON` entirely and redeploy again.

## Secrets with no overlap mechanism (rotation is a hard cutover)

These all share the same shape: change the environment variable, redeploy, and every existing
holder of the old value loses access at that instant. There is no code change needed to
"support" rotating them — the gap is operational (no maintenance-window/notification
procedure existed), not technical.

| Secret | Real impact of rotating | Procedure |
|---|---|---|
| `MARKETPLACE_ADMIN_TOKEN` | Every admin script/tool using the old token starts getting 401s the instant the new value is live | Update every caller (CI secrets, any operator's local `.env`, scripts under `apps/marketplace-api/scripts/`) *before* redeploying with the new value, not after — there is no dual-token grace period, so sequence this the other way around from a normal secret to avoid a self-inflicted lockout |
| `PAYMENT_WEBHOOK_SECRET` (marketplace) | The payment provider's webhook signature stops verifying the instant the values disagree; in-flight webhooks fail until both sides match | Coordinate the change with the payment provider's dashboard update in the same window — whichever side changes first will reject the other's requests/signatures until both are updated |
| `METRICS_TOKEN` (both apps) | Prometheus's scrape starts returning 401 immediately (this is the newest secret in the inventory, added with the observability work) | Update the token in both the app's env and the Prometheus scrape config's `bearer_token` in the same change; a scrape gap of one interval is the expected, low-stakes impact — this is the least disruptive secret to rotate in this whole list |
| `DATABASE_URL` (both apps) | Requires the database user's password to actually change, which is a platform-level operation (Railway) or manual `ALTER ROLE` (Compose/self-hosted) | Change the DB user's password at the platform/database level first, confirm the *old* connections drop (or let them drain), then update the env var and redeploy; there is no way to have both old and new credentials valid simultaneously for the same DB user, so a brief connection gap during redeploy is expected |
| `SENDGRID_API_KEY` | Provider-side; app fails closed (`notification-config.ts`'s shape validation just stops matching, so the notification path reports "not configured" rather than silently failing) | Revoke and regenerate in the SendGrid dashboard, update the env var, redeploy |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Same shape as SendGrid | Regenerate in the Twilio console, update both env vars together (they're a pair), redeploy |

## Secrets that are not rotated, only revoked/re-issued per-entity

- **Plugin signing private keys** (`wattanam-plugin keygen`, held by whoever signs releases,
  never on any server): there is no "rotation" of a compromised key — revoke its public
  counterpart from `PLUGIN_TRUSTED_KEYS` everywhere, generate a fresh keypair, and re-sign
  every future release with it. Already-installed plugin versions signed by the old key keep
  their installed state; only *new* installs/updates need the new key trusted.
- **`PublisherKey.publicKeyPem`**: not rotated as a platform secret — each publisher manages
  their own key lifecycle via `POST /v1/publishers/:id/keys` (new key) and the existing
  `revokedAt` mechanism (old key), already documented in
  [official-repository.md](../marketplace/official-repository.md).
- **`RefreshToken.token`**: this is the one entry in the inventory that isn't a rotation-runbook
  gap at all — it's a real at-rest storage defect (plaintext in the DB). No rotation procedure
  fixes that; it needs the same hash-at-rest treatment the marketplace's own session tokens
  already got in E-001. Restating it here only to be clear it isn't quietly folded into this
  document's scope.

## Verification

### `JWT_SECRET` overlap rotation

Live-drilled end to end using the real, unmodified `JwtService` (`@nestjs/jwt`, the same class
`AuthModule` wires up) and the real `resolveJwtVerificationSecret`/`verifyJwtWithRotationSupport`
functions:
[`backend/scripts/jwt-secret-rotation-live-drill.js`](../../backend/scripts/jwt-secret-rotation-live-drill.js),
8/8 checks pass — a pre-rotation token with no `kid` at all still verifies against the active
secret; a token signed under `jwt-v1` keeps verifying once `jwt-v2` becomes active and `jwt-v1`
is only a trusted secondary (the actual overlap); a fresh `jwt-v2` token verifies at the same
time; once `jwt-v1` is dropped from the secondary set the old token fails closed
(`JWT signing key is not trusted`) while the new one keeps working; and two negative controls
confirm an unknown key id is rejected and that standard JWT signature tampering is still caught
(this feature didn't weaken it). This closes a real, previously-true gap — `JWT_SECRET` had no
overlap primitive at all before this change, unlike the repository/entitlement keys, which
already had one but simply hadn't been drilled.

### Entitlement signing key rotation

Live-drilled end to end using the real, unmodified production functions on both sides —
`issueEntitlement()` (`apps/marketplace-api/src/entitlement.ts`, the marketplace's issuing side)
and `verifyFetchedEntitlement()` (`backend/src/marketplace/entitlement-verification.ts`, the
school's verification side). Both are pure functions with no database or NestJS dependency, so
this needed neither a live server nor a live database — it proves the cryptographic rotation
mechanics directly:
[`apps/marketplace-api/scripts/entitlement-signing-key-rotation-live-drill.js`](../../apps/marketplace-api/scripts/entitlement-signing-key-rotation-live-drill.js),
9/9 checks pass:

1. A token issued and signed under `entitlement-v1` verifies against a trust map containing
   only `entitlement-v1` (baseline, pre-rotation).
2. Adding `entitlement-v2` to the trust map (runbook step 2, done *before* touching the
   marketplace) doesn't break the still-active old token.
3. After the marketplace swaps its one active signing key to `entitlement-v2` (step 4, confirming
   the runbook's stated asymmetry — the issuing side really does only hold one key at a time,
   unlike the repository key's array), a freshly issued token carries `keyId: entitlement-v2` and
   verifies — and, the actual point of "overlap," the pre-rotation `entitlement-v1` token *also*
   still verifies against that same two-key trust map at the same time.
4. Once the overlap window closes and `entitlement-v1` is removed from the trust map (step 6),
   the new token keeps verifying but the old token now fails closed with "Entitlement signing key
   is not trusted" — demonstrating concretely why the runbook says to wait out the offline
   window before this step, not do it early.
5. Two negative controls: a token cannot claim a `keyId` other than the one that actually signed
   it ("Entitlement key id mismatch" — blocks a key-confusion/downgrade attempt), and a
   well-formed signature from a key the school was never told to trust is rejected outright.

### `IDENTITY_ENCRYPTION_KEYS_JSON` self-healing rotation

Live-verified against a real
disposable PostgreSQL 16, using the real `IdentityService`:

1. Registered an account, enrolled and confirmed MFA with only key `identity-v1` active. The
   stored `mfaSecret` column is confirmed `enc:v1:identity-v1:...`.
2. Reconfigured (simulating a redeploy) with **both** `identity-v1` and a new `identity-v2` in
   the keyring, `identity-v2` set active. Logged in with a fresh TOTP code from the
   still-`identity-v1`-encrypted secret: login succeeds (the old key is still in the ring), and
   the stored `mfaSecret` is confirmed rewritten to `enc:v1:identity-v2:...` immediately after
   that one login — the automatic re-encryption fires exactly as designed, no extra step
   needed.
3. Reconfigured again with **only** `identity-v2` in the keyring (`identity-v1` fully removed,
   simulating step 6 above). Logged in again with a fresh TOTP code: still succeeds, confirming
   it's now safe to have dropped the old key.
4. As a negative control, reconfigured with only the *original* `identity-v1` key (simulating a
   botched rotation that removed the new key too early) and attempted to decrypt the
   now-`identity-v2`-encrypted secret directly: fails with "Encrypted secret key identity-v2 is
   not configured" — confirming the failure mode if a rotation is sequenced wrong is a loud,
   immediate error, not silent data loss.
