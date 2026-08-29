# Legacy Adoption Comparison Procedure

Before adoption:

```text
npm run legacy:compare -- snapshot --owner-email owner@school.example --owner-password-file /run/secrets/legacy-owner-password --output /secure-evidence/before.json
```

Run the existing guarded backup/adoption procedure. Then compare:

```text
LEGACY_CERTIFICATION_SIGNING_PRIVATE_KEY_FILE=/run/secrets/legacy-certification.pem \
LEGACY_CERTIFICATION_SIGNING_KEY_ID=qa-2026 \
npm run legacy:compare -- compare --owner-email owner@school.example --owner-password-file /run/secrets/legacy-owner-password --before /secure-evidence/before.json --output /secure-evidence/report.json
```

Exit code `0` means PASS, `2` means unexplained differences, and `1` means the comparison itself could not complete. Never override a failed check by editing the report. If a migration intentionally changes legacy business rows, add a narrowly reviewed transformation rule in code with a failing-before/passing-after test; do not use a free-form runtime allowlist.

Store the signed report and public verification key outside the school project. Delete the sealed owner-password copy when the drill is accepted. The report contains hashes but should still be treated as internal operational evidence.
