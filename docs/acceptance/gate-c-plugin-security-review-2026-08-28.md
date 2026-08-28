# Gate C Plugin Review Checklist and Malicious-Fixture Suite — 2026-08-28

## Result

**C-007** is complete. All seven threat categories named in the master plan — traversal, bombs, tampering, capability abuse, migration abuse, SSRF, and secret access — are addressed: four already had dedicated coverage from earlier work (tampering, capability abuse, migration abuse — plus traversal partially), and the remainder (zip bombs, duplicate/symlink archive entries, and the SSRF/secret-access architectural-absence proof) are new in `backend/src/plugins/plugin-security-fixtures.spec.ts`. `docs/plugins/security-review-checklist.md` is the paired human review process, and it says plainly what the automated suite *cannot* prove — a plugin is trusted in-process code, not sandboxed, so review-before-signing is the real control for anything outside the SDK's own sanctioned surface.

## What's new

- **`plugin-security-fixtures.spec.ts`** (new): the single audit trail tying all seven categories to their proof.
  - *Traversal*: direct unit coverage of `safePackagePath` (path traversal, absolute paths, backslash traversal, null bytes) — the exact function `plugin-package.ts` calls before reading any archive entry.
  - *Bombs*: a package whose declared uncompressed size exceeds the configured limit is rejected before the entry is fully streamed (a real zip-bomb shape, not just "upload too large"); an oversized package is rejected before unzipping even starts; a symlink archive entry (a bomb/traversal hybrid — linking a huge or sensitive host path into the package) is rejected.
  - *Duplicate archive entries* (a classic zip-parser confusion vector): rejected.
  - *SSRF*: proved architecturally, not just filtered — `PLUGIN_CAPABILITIES` contains no HTTP/fetch/network primitive at all, and the exact runtime context object a plugin's `activate()` receives is asserted key-for-key (`database, directory, events, jobs, logger, navigation, notifications, permissions, pluginId, realtime, routes, sdkVersion, settings, storage` — nothing else).
  - *Secret access (sanctioned surface)*: the same context-key assertion is the proof there's no `env`/`process`/`config`/raw-`prisma` property to read secrets from, and the assertion is cross-referenced to `assertPluginNamespace`'s existing rejection of any table reference outside a plugin's own namespace.
  - Tampering, capability abuse, and migration abuse are referenced to their existing dedicated suites (`plugin-package.spec.ts`, `plugin-runtime.service.spec.ts`, `plugin-migrations.service.spec.ts`/`plugin-sql-guard.spec.ts`) rather than duplicated.
- **`docs/plugins/security-review-checklist.md`** (new): an automated half (run the fixture suite, table mapping each category to its proof) and a manual half that exists specifically because the automated half can't cover it — reading a plugin's actual code for direct `process.env`/`child_process`/raw network calls, checking dependencies for CVEs and hidden capability, hand-reading migration SQL rather than trusting the syntactic guard alone, and a sign-off record format. States the trust-model limitation explicitly: a plugin is in-process JavaScript with no V8 isolate or OS sandbox, so the SDK closing off `fetch`/`env`/etc. from the *sanctioned* API doesn't stop a plugin's own code from calling `process.env` directly — review-before-signing is the actual control for that gap, not a technicality to gloss over.

## Bugs found and fixed while building the fixtures (worth recording)

- `withLimit`'s test-helper originally restored `process.env.PLUGIN_MAX_UNPACKED_BYTES = previous` where `previous` could be `undefined` — in Node, assigning `undefined` to a `process.env` key coerces it to the *string* `"undefined"` rather than deleting it, which corrupted a later test's environment. Fixed to `delete` the key when there was no prior value. A reminder that `previous === undefined ? delete : reassign` is the only safe env-restore pattern, not just `process.env.X = previous`.
- The symlink fixture initially used yazl's `unixPermissions` option, which doesn't exist — the real option is `mode` (`Entry.prototype.setFileAttributesMode`). The wrong option name meant the constructed archive silently had no symlink bit set, and the test failed downstream with an unrelated "missing plugin.json" error instead of ever exercising the rejection path. A reminder that a fixture which produces a confusing, unrelated failure is itself a bug in the fixture, worth chasing to ground rather than loosening the assertion.
- A path-traversal entry name (`../escape.txt`) can't be constructed through yazl's own `addBuffer` at all — it validates paths client-side the same way real zip libraries increasingly do. Rather than fighting the tooling to build an adversarial fixture that legitimate libraries refuse to produce, the direct unit test of `safePackagePath` (the exact function `plugin-package.ts` calls during extraction) stands as the proof instead.

## Verification

```text
Full backend suite: 33 passed, 33 total (157 tests, +7 from this change)
Backend build (swc): 174 files compiled
TypeScript build: passed (tsc --noEmit)
```

No live-database verification was needed — this work is entirely package-verifier/runtime-context-shape proof, not database behavior.

## Open items

- The manual checklist has not yet been exercised against a real third-party submission — there is no third-party publisher yet (Gate C0/F0 both still closed). It will get its first real workout whenever the first invited-publisher pilot plugin is reviewed.
- Dependency-CVE scanning for a plugin's own `require`d npm packages is a manual checklist item, not automated — no plugin has declared external dependencies yet to build tooling against.
- C-008 (plugin CLI, typed SDK package, local harness, templates, publish tooling) is the last open Phase C item.
