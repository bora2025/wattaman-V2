# MP2 Academic registration settings browser evidence — 2026-09-29

Status: **local browser acceptance passed; hosted Railway acceptance pending**

Academic Management `0.1.13` adds its plugin-owned registration-settings interface. The browser
workflow uses the production declarative plugin host and verifies the administrator can:

- load all built-in registration field modes;
- save a changed field mode through the plugin-owned settings route;
- list existing custom fields;
- create a multi-select field with JSON-array options;
- select and delete an existing custom field; and
- complete the workflow without horizontal document overflow or serious/critical Axe findings.

Command run from `frontend/`:

```powershell
node scripts/run-plugin-ui-e2e.js academic-management-ui.spec.ts
```

Result: **3 passed** — Pixel 7 phone, 820×1180 tablet, and Desktop Chrome.

This closes the local browser implementation gap for registration settings. It does not certify
the hosted Railway artifact, real production data, or the complete administrator/teacher/student
Academic role matrix. Those checks must run against the exact signed release before any ownership
switch or legacy removal.
