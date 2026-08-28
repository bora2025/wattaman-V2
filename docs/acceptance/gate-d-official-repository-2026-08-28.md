# Gate D Implementation Evidence — 2026-08-28

This dossier maps Phase D implementation to the acceptance evidence in the master execution plan. It closes work packages D-001–D-007; formal Gate D0/D1/D2 approval still depends on their separately named business/deployment prerequisites.

| Work package | Evidence |
|---|---|
| D-001 | Separate Railway project `Wattanam V2 Marketplace`, managed PostgreSQL, and persistent `/data/artifacts` volume. Five migrations applied. The official announcements object survived a service restart and a remove/restore drill; before/after/restore SHA-256 remained `0631472…31c75`. Metadata and publisher rows also survived restart. Artifact paths are digest-derived and publication refuses an existing version/object. |
| D-002 | Publisher and repository keys are distinct. Multi-signature metadata and school keyrings implement overlap. Production deployment `12c37fb6-141e-4b3f-9bd4-b6787bf67f08` signed with active `repository-2027` plus `repository-2026`; both public keys independently verified the same payload. Malformed secret configuration failed closed. The custody, quorum, rotation, and revocation procedure is documented. |
| D-003 | The signed index contains compatible core releases, plugin releases, and advisories. Resolver tests cover channel/core compatibility and tampering. The school verifies canonical Ed25519 metadata, expected/trusted key IDs, origin, checksum, package signature, replay watermark, and downgrade rules. |
| D-004 | `core-release.yml` builds API/web/gateway once, records digests, generates CycloneDX SBOMs and provenance/release evidence, signs with Cosign, and publishes beta metadata. `promote-core-release.yml` calls the promotion API without a build job. Repository tests prove beta→stable mutates the existing core/plugin release row and returns identical digests/SHA with `rebuilt:false`. |
| D-005 | `prepareCoreUpdate` validates the signed target, blocks incompatible active plugins before backup, creates a real backup, journals the operation, and enters durable read-only maintenance. Completion records healthy or `recovery_required`; failure retains the backup and maintenance recovery path. Focused tests exercise both paths and restart persistence. |
| D-006 | Withdrawal atomically changes release/review state and creates an advisory carrying action and communication URL. A signed emergency advisory deactivates matching plugins without deleting data. Custody, incident, customer communication, and tabletop procedures are stored under `docs/operations`. |
| D-007 | Automated school tests cover unavailable/slow repository, corrupt checksum, tampered metadata, replay, downgrade, restart-persisted watermark, incompatible plugins, backup/maintenance failure recovery, and emergency disable. Assertions confirm installed plugin state/data is unchanged by repository failures and updates remain optional/offline. The production marketplace restart and artifact restore drills cover the service side. |

## Verification results

- Backend focused update verification: 4 suites, 18 tests passed; backend TypeScript build passed (173 files).
- Marketplace verification before unrelated Phase E work entered the worktree: 7 suites, 42 tests passed; TypeScript build and Prisma schema validation passed.
- Production stable index: HTTP 200, active key `repository-2027`, two signatures, old-key verification true, new-key verification true.
- Production artifact: HTTP 200, 7,433 bytes, expected and actual SHA-256 identical.
- Release-evidence generator produced commit/lockfile hashes, digest-pinned image evidence, SBOM paths, provenance, and notes from a fixture run.

## Operational references

- [Official repository](../marketplace/official-repository.md)
- [Repository key custody and rotation](../operations/repository-key-custody-and-rotation.md)
- [Core update and recovery](../operations/core-update-and-recovery.md)
- [Repository security incident](../operations/repository-security-incident.md)
- [Backup and restore](../operations/backup-and-restore.md)
