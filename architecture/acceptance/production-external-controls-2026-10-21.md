# Production external controls preflight

- Date: 2026-10-21 (Asia/Phnom_Penh)
- Environment: Railway `marketplace` / `production`
- Command: `railway run --service marketplace-api --environment production node tools/verify-production-external-controls.js --report-only`
- Secret handling: the verifier reports configuration state only and never emits credential or private-key values.

## Result

The preflight correctly returned **not ready** for the external-control cutover.

Passing controls:

- S3-compatible shared artifact storage is configured.
- `APP_VERSION` contains traceable, non-development release metadata.

Controls still requiring an external provider or credential:

- A remote HTTPS Ed25519 signer is not selected.
- Remote signer authentication is not configured.
- Marketplace still retains its local repository private key.
- Two distinct trusted repository public keys are not configured for overlap rotation.
- Transactional email remains disabled.
- The temporary `ALLOW_MFA_ONLY_PRODUCTION=true` exception remains enabled.

AWS was explicitly excluded by the operator on 2026-10-21. This does not waive the architecture controls: another KMS/HSM and transactional-email provider must be selected and certified before the local repository key can be removed or the isolated third-party execution runtime can begin.

Run without `--report-only` in release automation. In enforcement mode, any failed control exits non-zero and blocks the release.
