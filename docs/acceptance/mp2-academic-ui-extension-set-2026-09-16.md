# MP2-006 Academic UI Extension Set — Progress Evidence

Date: 2026-09-16
Scope: Declarative plugin UI pages for Study Years, Classes, and Registrations in `wattanam.academic-management`.

## What was added

### Backend routes (plugin-owned)

- `GET study-years/:id` — study year detail for declarative detail/edit pages.
- `GET classes/:id` — class detail with teacher/class-admin/study-year joins.
- `GET classes/:id/students` — roster of students enrolled in a class (core `Student`/`User` join).
- `GET admissions/registrations` — paginated registration list with class name.
- `GET admissions/registrations/:id` — registration detail.
- `PATCH admissions/registrations/:id/resolve` — approve/reject registration.
- `GET teachers` — teacher directory with department join (filters by `departmentId`).

### Declarative UI pages (`plugins/wattanam.academic-management/frontend/page.json`)

| Page | Route | Permission | Components |
|------|-------|------------|------------|
| Study Years | `study-years` | view | table + create form |
| Study Year detail | `study-years/:id` | view | detail card |
| Study Year edit | `study-years/edit/:id` | manage | edit form |
| Classes | `classes` | view | table + create form |
| Class detail | `classes/:id` | view | detail card |
| Class edit | `classes/edit/:id` | manage | edit form |
| Class Students | `classes/:id/students` | view | roster table + add-student form |
| Registrations | `registrations` | manage | table |
| Registration detail | `registrations/:id` | manage | detail card + resolve form |
| Teachers | `teachers` | view | directory table |

### Navigation (`plugin.json`)

- Departments
- Study Years
- Classes
- Teachers
- Registrations (manage permission)

## Validation

- `node --test scripts/academic-management-reference-plugin.test.js` — 6/6 pass.
- `npm.cmd run build` (backend) — compiles 297 files.
- Jest specs:
  - `src/classes/classes.controller.spec.ts` — 3/3 pass.
  - `src/study-years/study-years.controller.spec.ts` — 3/3 pass.
  - `src/class-registrations/class-registration-approved-subscriber.service.spec.ts` — 2/2 pass.
  - `src/class-registrations/academic-lifecycle-subscriber.service.spec.ts` — 2/2 pass.

## Validation status

All planned MP2-006 UI pieces for this slice are implemented locally:

- Class student roster list/add UI.
- Teacher directory UI.
- Registration approve/reject action UI.
- Hosted render test in the plugin page host remains open.
