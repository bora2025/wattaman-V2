# Changelog

## 0.24.0

- Upgrade workforce creation with named position selection backed by the live organization structure.
- Align employee and employer forms with Academic Management's guided, responsive workflow patterns.
- Add reusable dynamic select sources to the universal host form contract.

## 0.23.1

- Replace the unused durable-event grant with the least-privilege database transaction capability.

## 0.23.0

- Moved CRUD commands into the Actions column of each record row.
- Removed detached bulk-action cards and selection checkboxes from CRUD tables.
- Kept destructive confirmations and server-side audit protections for every row action.

## 0.22.1

- Modernized CRUD creation flows with compact action cards and button-triggered forms.
- Added clearer confirmations and direct navigation from newly created records to their edit pages.
- Simplified compensation amount entry to use normal currency amounts consistently.

## 0.22.0

- Completed UX-driven CRUD controls for positions, workforce members, HR calendar items, and compensation adjustments.
- Added guarded bulk actions, clickable edit rows, and a dedicated reward/deduction editor.
- Preserved audit integrity with workforce archival, audited calendar soft deletion, assigned-position protection, and payroll-linked adjustment protection.

## 0.21.0

- Completed Employee and Employer Salary Terms CRUD with explicit configured-state tracking.
- Added selectable salary rows and safe removal that retains workforce profiles and historical payroll records.
- Prevented payroll calculation until salary terms are configured for the workforce member.

## 0.20.0

- Completed Payroll Register CRUD with selectable rows and guarded deletion of pristine draft payroll records.
- Protected approved, paid, void, and previously edited payroll records from deletion to preserve audit history.
- Kept review, payslip, draft editing, approval, payment, and void workflows available from each payroll row.

## 0.19.0

- Completed payroll-type CRUD with guarded deletion for unused reusable payroll formats.
- Added selectable payroll-type rows and a bulk delete action to the Salary & Payroll workflow.
- Protected assigned types and payroll-history references from deletion; administrators can deactivate those types instead.

## 0.18.1

- Shortened the payroll-types guidance title to satisfy the customer host's 200-character component-title contract.
- Added a regression test that verifies every declarative UI component title remains compatible with the customer host.

## 0.18.0

- Added reusable payroll types for workforce groups such as CEO, Head Office, and Staff.
- Added reusable defaults for overtime, bonuses, reimbursements, leave adjustments, allowances, deductions, and taxes.
- Added workforce-to-payroll-type assignment using the visible workforce number.
- Added controlled batch payroll generation that creates up to 500 missing drafts per run and never overwrites existing payroll records.
- Added create, edit, assignment, member-count, and batch-generation UI for scalable payroll administration.

## 0.17.17

- Standardized salary, payroll, rewards, deductions, and promotion forms on normal currency amounts while retaining integer minor-unit storage internally.
- Resolved visible workforce numbers consistently across salary, payroll, leave, permission, disciplinary, compensation, and promotion workflows.
- Added normalized currency values to profile, payroll, payslip, and report responses so the same amount is shown throughout the plugin.
- Added prefilled salary editing from the payroll directory and audited draft-payroll editing with server-side total recalculation.
- Prevented approved, paid, and void payroll records from being modified through the edit workflow.

## 0.17.16

- Fixed salary setup and payroll calculation to accept the visible employee/workforce number as well as the internal employee ID.

## 0.17.15

- Removed the final false-positive relation token from the payroll trigger so it passes the customer SQL namespace guard.

## 0.17.14

- Rewrote the payroll calculation-freeze guard to remain compatible with the customer host SQL namespace scanner.

## 0.17.13

- Expanded payroll into an audit-ready gross-to-net register covering allowances, overtime, bonuses, reimbursements, leave adjustments, statutory and post-tax deductions, and taxes.
- Added deterministic gross pay, total deduction, total tax, and net pay calculations while retaining attendance-based salary and HR adjustments.
- Added payroll register printing and Excel export plus an individual reviewable and printable payslip.
- Kept tax amounts explicit and policy-controlled instead of hard-coding jurisdiction-specific rates.
- Added visible page-flow guidance across Organizing Management, including current-stage context, the recommended next stage, and a dedicated profile editing guide.

## 0.17.12

- Merged complete employee and employer profile creation into the Employers & Employees page.
- Kept the full creation form behind the compact Add employer / employee button.
- Removed the redundant Add Employee / Employer sidebar destination.
- Made employee and employer profiles read-only by default with an explicit Edit profile, Cancel, and Save changes workflow.

## 0.17.11

- Converted the Employers & Employees creation form into a compact expandable Add employer / employee action.
- Made workforce rows open the unified employee/employer profile workspace.
- Added professional workforce printing and native Excel export.

## 0.17.10

- Made every Workforce Profiles row open the unified employee/employer HR lifecycle workspace.
- Added an explicit Edit employee/employer HR lifecycle action without introducing a separate lifecycle destination.

## 0.17.9

- Replaced the stacked profile blocks with a professional three-column employee and employer workspace.
- Added integrated profile image, editable employment details, salary summary, ID card, and interactive HR lifecycle panels.

## 0.17.8

- Corrected universal table column identifiers so the lifecycle profile installs on customer hosts.

## 0.17.7

- Replaced the onboarding-style employee view with a unified employee and employer HR workspace.
- Added salary, rewards, deductions, permissions, disciplinary actions, job promotions, payroll history, and ID-card information to the profile.
- Kept the lifecycle workspace universal, permission-scoped, and fully supplied by the plugin without customer-host frontend files.

## 0.17.6

- Consolidated employee and employer editing into one complete profile form.
- Added editing for identity, employment, contact, position, status, photo, and emergency fields.
- Added regression coverage for the complete workforce profile contract.

## 0.17.5

- Improved employee and employer profile navigation with an explicit open-and-edit workflow.
- Redirect newly created workforce records directly to their editable profile.

## 0.17.4

- Added a complete employee and employer profile workflow covering identity, contact, employment, emergency-contact, and notes fields.
- Added permission-filtered workforce search with direct navigation to editable employee and employer profiles.
- Added a professional Add Employee / Employer workspace and navigation entry using the universal plugin UI contract.

## 0.17.3

- Added a professional workforce attendance-settings workspace with four configurable check-in and check-out sessions.
- Added organization-wide working-day presets and attendance format-rule controls.
- Synchronized saved session windows and working days with the camera and USB scanner policy.
- Adopted the host-owned universal session manager so customer installations need no plugin-specific frontend code.

## 0.17.2

- Standardized 21 organization, workforce, calendar, leave, payroll, employee-relations, profile, and ID-card screens around one professional six-stage workflow.
- Added searchable operational tables across workforce and HR management pages.
- Added printable PDF and CSV payroll attendance reporting.
- Connected list, detail, review, and edit screens with consistent navigation and contextual guidance.

## 0.17.1

- Unified Scan, Reports, Corrections, and Settings into a professional four-step attendance workflow.
- Added report-period filters, searchable workforce attendance tables, print/PDF/CSV export, and scanner audit visibility.
- Improved correction review and edit layouts while preserving immutable correction history.
- Expanded attendance settings guidance and active-policy presentation.
- Renamed Attendance Records to Attendance Reports across package and runtime navigation.

## 0.17.0

- Migrated the dashboard, workforce directory, and report workspace to the universal declarative UI contract.
- Declared universal portability so Customer School can validate and render the plugin without Organizing-specific host code.
- Added reusable workflow navigation, nested dashboard metrics and tables, printable workforce, attendance, and salary reports.
- Adopted SDK 1.3 for stable host-owned plugin error contracts and pre-publication portability checks.
- Mapped expected camera and USB attendance rejections to safe, declared 4xx responses instead of generic server errors.

## 0.16.5

- Cast scanner timestamps explicitly for PostgreSQL raw queries.
- Fixed camera and USB scans failing while recording rejected or accepted attempts.
- Kept attendance check-in and check-out timestamps consistent with the database schema.

## 0.16.4

- Declared the durable-events capability required by the customer runtime for atomic database transactions.
- Restored camera and USB attendance scans, including idempotent scan logging and attendance record updates.
- Added contract coverage to prevent transactional handlers from shipping without the required capability.

## 0.16.1

- Split the installation schema into independently verified single-statement migrations required by Customer School.
- Preserved PostgreSQL payroll trigger functions as single top-level migration statements.
- Added customer runtime SQL parsing that correctly ignores semicolons inside PostgreSQL dollar-quoted function bodies.
- Fixed first-time activation failing with “Migration must contain exactly one SQL statement”.

## 0.16.0

- Corrected printable attendance reports to count true no-shows from configured workdays.
- Excluded organization holidays and approved leave or permissions from absence totals.
- Required an explicit date period for authoritative attendance summaries.
- Removed sensitive identity and address fields from the general printable workforce list.
- Aligned protected employee-detail UI permissions with the secured backend route.
- Returned the authoritative database-triggered payroll calculation so the UI matches stored absence and salary totals.

## 0.15.0

- Removed QR credentials and sensitive personal fields from the general workforce directory API.
- Added a separately authorized workforce-profile data source for HR administrators.
- Restricted detailed employee records to workforce-management permission.
- Stopped returning newly created QR credentials from the general employee creation workflow.
- Added strict email and HTTPS/uploaded-image validation for workforce profiles.

## 0.14.0

- Added editable HR calendar detail pages and guarded update routes.
- Added transactional calendar row locking and immutable before-change audit snapshots.
- Added calendar actor attribution and recoverable retirement schema support.
- Enforced valid 24-hour attendance times and chronological schedule ordering.

## 0.13.1

- Removed duplicate runtime permission registrations that could fail on strict plugin hosts.
- Added activation contract tests for UI routes, permissions, navigation uniqueness, and plugin table namespace isolation.
- Improved workforce directory filter accessibility and organization-specific ID-card defaults.

## 0.13.0

- Fixed no-show employees being omitted from attendance-based payroll absence calculations.
- Derived expected workdays from configured weekdays while excluding organization holidays.
- Integrated approved paid/unpaid leave and attendance permissions into payroll day counts.
- Recalculated monthly absence deductions and daily wages from authoritative calendar data.

## 0.12.0

- Added payroll review pages with explicit approve, pay, and void actions.
- Added row navigation from payroll history into secured state transitions.
- Added disciplinary action detail, activation, resolution, and void UI.
- Exposed guarded disciplinary lifecycle transitions through the customer-school interface.

## 0.11.1

- Made the dashboard use the configured organization timezone.
- Added strict report date-range validation.
- Restricted report and ID-card logos to HTTPS URLs or supported uploaded image data.
- Added automated security workflow coverage for approvals, corrections, timezone, report ranges, and ID-card templates.

## 0.11.0

- Added editable professional workforce ID-card templates with organization logo support.
- Added CR80 portrait and landscape print layouts and a two-sided card preset.
- Added live QR attendance credentials to every active workforce card.
- Added a protected QR credential rotation route with actor and timestamp attribution.
- Added the workforce ID-card page and navigation entry.

## 0.10.0

- Added a complete audited attendance-correction workflow with original and replacement values.
- Added correction history, record detail, correction forms, and dedicated navigation.
- Added requester and reviewer attribution with self-approval prevention for day-off requests.
- Added creator attribution for disciplinary actions and promotions.
- Added guarded disciplinary action resolution and void transitions.
- Validated organization timezones as real IANA timezone identifiers.

## 0.9.0

- Added payroll creator, approver, payer, voider, and transition-audit attribution.
- Enforced creator/approver and approver/payer separation of duties with transactional row locks.
- Prevented approved, paid, or void payroll periods from being silently recalculated.
- Added overflow validation for every persisted payroll monetary total.
- Added creator attribution for rewards and deductions.
- Added requester/reviewer attribution and self-approval prevention for attendance permissions.

## 0.8.0

- Hardened scanner transactions so rejected attempts remain auditable after the attendance transaction completes.
- Redacted raw QR values from scan history and stored a SHA-256 fingerprint instead.
- Added scanner principal attribution, bounded coordinate validation, and per-principal rate limiting.
- Preserved deterministic idempotent responses for both accepted and rejected retry attempts.
- Added structured scanner metadata without exposing the employee QR credential.

## 0.7.1

- Aligned organization USB scanning with the Academic Management staff attendance station.
- Added the same keyboard-wedge scanner mode, focus-first input, Enter submission, debounce, idempotency, geolocation fields, and camera/USB switching.
- Added today’s employer and employee attendance directly below the scanner station.

## 0.7.0

- Added full-screen camera QR and USB keyboard-scanner attendance stations.
- Added server-authoritative check-in, late, check-out, workday, holiday, day-off, and permission evaluation.
- Added idempotent scan commands, per-employee transactional locking, offline-age validation, and duplicate protection.
- Added accepted and rejected scan audit history with device source and rejection reason.
- Added editable attendance workdays, schedule times, checkout delay, and offline scan policy.
- Added attendance records and scanner-audit pages for employers and employees.

## 0.6.0

- Added a modern searchable workforce directory with type and employment-status filters.
- Added a unified detail editor for employer and employee identity, contact, position, status, personal, and emergency information.
- Added active-position selection directly in the workforce profile editor.
- Added professional SVG icon mappings for every Organizing Management navigation feature.
- Added a dedicated Workforce Profiles navigation destination optimized for customer-school rendering.

## 0.5.0

- Expanded employer and employee profiles with personal, identity, address, emergency-contact, and notes fields.
- Added printable employee-list, attendance, and salary reports.
- Added reusable editable report headers, logo, custom text, footer, signer, paper size, and orientation.
- Added an editable report date and additional one-time text before printing or saving as PDF.

## 0.4.0

- Refined attendance-based payroll to report present, absent, and approved permission days separately.
- Excluded approved permission dates from monthly absence deductions.
- Added disciplinary-action records for warnings, suspension, and termination recommendations.
- Added transactional job promotions that preserve position and salary history.
- Added dedicated Disciplinary Actions and Job Promotions management pages.

## 0.3.0

- Added monthly, daily, and hourly salary configuration for employers and employees.
- Added good-job rewards, seniority bonuses, year-end bonuses, and other earnings.
- Added salary deductions, wage deductions, and other deductions with required reasons.
- Added attendance-based draft payroll calculation with stored attendance and adjustment audit data.
- Added late-arrival, early-departure, short-leave, remote-work, and other permission requests with approval workflow.

## 0.2.0

- Added organization profile configuration for companies, shops, stores, nonprofits, and other organizations.
- Added position and workforce-member management for employers, employees, contractors, and interns.
- Added HR calendar entries for holidays, events, paydays, meetings, and reminders.
- Added employee day-off requests with pending, approved, rejected, and cancelled workflow states.
- Added dedicated professional navigation and declarative UI pages for the new HR workflow.

## 0.1.0

- Introduced the Organizing Management plugin foundation.
- Added a live workforce and daily attendance dashboard.
- Added isolated employee, calendar, attendance, and settings storage for upcoming modules.
# 0.16.2

- Register the Organizing Management dashboard, reports, and workforce profile components with the Customer School UI contract.
- Declare runtime route parameters for salary updates and ID-card template saves so the complete UI bundle passes activation validation.

# 0.16.3

- Prevent employee and employer creation from failing when an optional position value is not an existing position foreign key.
- Resolve linked positions by ID, code, or exact title while preserving the free-text position label.
- Remove the unsafe raw Position ID fields from the standard employee forms.

