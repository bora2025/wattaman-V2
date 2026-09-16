# MP-1 Announcements Clean-Core Marketplace Install Evidence

Date: 2026-09-15
Status: pass
Wave: MP-1 low-coupling proof

## Goal

Prove announcements installs from marketplace on a clean core path (no pre-existing plugin rows required) and can be activated after install.

## Verification approach

Automated service-level verification of the marketplace purchase install pipeline in:

- backend/src/marketplace/marketplace-commerce.service.spec.ts

The tests validate:

- marketplace release selection and artifact fetch
- checksum verification before install
- install call succeeding with no dependency on existing plugin registry rows
- trusted publisher key merge/persist path for first-time marketplace publisher install
- optional activate-after-install behavior

## Command executed

From backend workspace:

- node node_modules/jest/bin/jest.js --runInBand src/marketplace/marketplace-commerce.service.spec.ts --watchAll=false --verbose --forceExit

## Result

- Suites: 1 passed, 0 failed
- Tests: 2 passed, 0 failed

Passing tests:

- installs a marketplace plugin on clean core without requiring existing plugin rows
- merges and persists a release publisher key, then activates when requested

## Assessment

The MP-1 criterion "Plugin installs from marketplace on clean core" is satisfied for announcements via reproducible automated evidence in this wave.
