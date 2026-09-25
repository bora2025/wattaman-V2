# MP-6 Learning declarative UI — local acceptance evidence

Date: 2026-09-25

Status: local host-rendered UI contract accepted; hosted browser, accessibility and real-device
certification remain open.

Learning 0.1.2 now declares seven permission-gated host-rendered pages:

- teacher course catalog and creation;
- parameterized course workspace for lessons, enrollments, sessions and engagement;
- lesson page authoring and pending-grade review;
- assignment catalog and creation;
- parameterized rich quiz-question authoring;
- student course discovery; and
- student assignment discovery.

All pages use the shared declarative renderer and plugin API dispatch. No Learning React business
bundle was added to lean core. A focused contract activates the package and proves that every UI
data source maps to a registered runtime route with the same permission.

## Verification

```text
Learning/plugin UI focused suites: 58 passed, 0 failed
Frontend production build: 132 routes generated
```

This evidence does not claim visual parity with all legacy teacher/student screens, browser
accessibility, real-device behavior, or hosted lifecycle completion.
