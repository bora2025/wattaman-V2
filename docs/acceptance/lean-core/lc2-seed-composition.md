# LC2-006 Seed composition acceptance

Status: **accepted** on 2026-09-11.

## Boundary

`backend/src/distribution/seed-composition.ts` is the reviewed registry for development seed
sections. It applies the same `core | legacy-full` distribution contract as API and worker
composition.

- `core` seeds only `core-identity`, a generic development administrator in the `User` model.
- `legacy-full` retains the core identity and the existing school-domain demo fixtures.
- `legacy-business-demo` owns departments, teacher/student/parent identities, class and student
  records and is never selected by `core`.
- Production continues to reject the development seed before any database write.

`backend/src/distribution/seed-composition.spec.ts` proves the exact section and model selection for
both profiles. The seeder dispatch is exhaustive through `Record<SeedSectionName, ...>`, so adding a
registered section requires an implementation and review.

## Verification

- Focused seed-composition tests pass (2/2).
- Distribution contract tests pass.
- Backend TypeScript build passes.
- Architecture inventory gate and repository tool tests pass.

