# LC2-007 configuration validation acceptance

Status: **accepted** on 2026-09-11.

## Startup contract

`WATTANAM_DISTRIBUTION` accepts exactly `core` or `legacy-full`, after trimming and normalizing case.
An absent or blank value remains `legacy-full` for upgrade compatibility. Any other value fails with
an error that names the variable, offending value and both supported choices.

API and worker startup use the dedicated validators in `backend/src/config/startup-config.ts` before
calling `NestFactory`. These validators also preserve the process-role boundary. Development seeding
uses the same distribution parser before selecting seed sections, and production seeding remains
disabled.

## Verification

- Entrypoint tests prove invalid distribution failure for API and worker startup.
- Entrypoint tests prove valid profile propagation and explicit role mismatch errors.
- Runtime environment tests prove defaulting, normalization and exact error text.
- Backend build, architecture inventory gate and repository tool tests pass.

