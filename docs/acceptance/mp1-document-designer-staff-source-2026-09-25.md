# MP1 Document Designer Staff Source — Local Evidence

Date: 2026-09-25
Status: local contract verified; hosted authorization and output parity remain open

Document Designer 0.1.4 adds a bounded `POST sources/staff` adapter protected by the existing
generate permission. The caller supplies one to 500 unique stable directory user IDs. The adapter
fails closed for missing identities and for Student or Parent roles.

Human Resources 0.1.2 publishes `staff-document-profile` v1 after a successful CV update. That
projection contains only the stable directory user ID and title. Document Designer combines it
with Directory-owned display name and role, returning exactly `id`, `name`, `role`, and `title`.
Email, phone, CV narrative, skills, education, work history, certifications and payroll are never
published or returned. Human Resources is an optional dependency; the source still returns the
Directory label with a null title when the projection is unavailable.

Verification:

- Document Designer reference suite: 9/9 passed.
- Human Resources source and behavior suites: 7/7 passed.
- Plugin CLI validation and activation harness: passed for both packages.

Remaining gates are hosted role/row-scope verification, browser-driven staff-card generation,
pixel/output comparison, and lifecycle certification.
