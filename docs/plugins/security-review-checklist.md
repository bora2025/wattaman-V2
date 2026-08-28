# Plugin Security Review Checklist

Status: gates Gate C0 (no third-party publisher access opens until this process — and DEC-011 — exist). Run this checklist before signing any plugin package with a trusted key, whether it's an official Wattanam plugin or (once F-pilot opens) an invited publisher's.

This checklist has two halves. The first is **automated** — a fixed, reusable proof already in the backend test suite. The second is **manual** — things no test can enforce because the trust model is "reviewed and signed code," not an OS-level sandbox. Skipping the manual half because the automated half is green is the single most common way a review goes wrong.

## Automated: `plugin-security-fixtures.spec.ts`

Run `cd backend && npx jest plugin-security-fixtures` before every review. It proves the *platform* correctly rejects each of the seven threat categories the master plan names for C-007 — it does not, and cannot, inspect the specific plugin under review. That's what the manual section is for.

| Category | Proof |
|---|---|
| Traversal | `safePackagePath` rejects `../`, absolute paths, backslash traversal, and null bytes; wired into archive extraction before any entry is read. |
| Bombs | A declared-uncompressed-size check rejects an entry (or a whole package) before it's ever streamed — a small compressed upload can't expand past the configured limit. |
| Tampering | `plugin-package.spec.ts` — a tampered payload, an undeclared extra file, or an invalid signature all fail verification. |
| Capability abuse | `plugin-runtime.service.spec.ts` — every one of the twelve capabilities individually rejects a call the manifest didn't declare. |
| Migration abuse | `plugin-migrations.service.spec.ts` / `plugin-sql-guard.spec.ts` — cross-namespace table access, transaction/role/grant control statements, multi-statement stacking, and an undeclared destructive operation are all rejected. |
| SSRF | The capability list contains no outbound-HTTP primitive, and the exact runtime context object a plugin receives is asserted key-for-key — there is no `fetch`/`http`/`network` surface to abuse in the first place. |
| Secret access (sanctioned surface) | Same context-key assertion covers this too: no `env`, `process`, `config`, or raw `prisma` property exists on the object a plugin receives; `database.read/write` cannot address a table outside its own namespace, so it can't reach `User.password` or another plugin's data through the SDK. |

## Manual: what no test can prove

A plugin is **trusted in-process server code** (see `package-and-runtime.md`'s Trust model). It runs as plain Node.js with no V8 isolate, no `vm` sandbox, and no OS-level confinement beyond the container it's already in. That means a plugin's own module code can call `process.env`, `require('child_process')`, `require('fs')` against paths outside `PLUGIN_DATA_DIR`, or `require('http')`/`require('net')` directly — none of that is something the SDK can prevent at the JavaScript level, because the plugin *is* JavaScript running in the same process. The automated suite proves the *sanctioned* API surface is closed; it says nothing about what the plugin's own code does outside that surface. This is why review-before-signing is the actual control, not a technicality:

- [ ] **Read every line of `backend/index.js` (and anything it `require`s that isn't a well-known npm package already used elsewhere in this repo).** Look specifically for: `process.env`, `child_process`, `require('http')` / `require('https')` / `require('net')` / any HTTP client library, `eval`/`new Function`, dynamic `require(variable)`, and filesystem calls that don't go through `context.storage.*`.
- [ ] **Check declared npm dependencies (if any) for known CVEs** and for packages that themselves shell out or make network calls. A plugin has no dependency-capability gate — anything it `require`s runs with the same trust as its own code.
- [ ] **Confirm every declared capability is actually used**, and every capability actually used is declared. An unused `notifications.send` declaration is a red flag for "this plugin author copy-pasted a manifest and didn't think about what they're asking for."
- [ ] **Read every migration's SQL by hand**, not just trust that `validateSql` passed. The automated guard blocks the *syntactically* obvious abuse (transaction control, cross-namespace tables); it doesn't evaluate whether a `destructive: true` migration is actually a reasonable thing to ship, or whether column types/constraints make sense.
- [ ] **Check the manifest's `dependencies` field** for a dependency on a plugin you don't also trust, or a suspiciously wide semver range.
- [ ] **Check `supportUrl`/`privacyUrl`** actually resolve to the claimed publisher's real domain (both are validated as HTTPS URLs, but never fetched or content-checked by core).
- [ ] **For a publisher outside your own organization** (not applicable until Gate F0): verify their identity and signing-key custody out of band before trusting their key at all — this checklist assumes the key is already trusted; establishing that trust is a separate, DEC-011-gated process.

## Sign-off

Record, per install/update reviewed: plugin id + version, reviewer, date, automated suite result (pass/fail), and an explicit note per manual checklist item (not just "reviewed" — what was actually checked). Keep this alongside the signing action itself so a later incident review can reconstruct what was and wasn't looked at.
