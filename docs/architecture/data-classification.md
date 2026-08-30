# Field-Level Data Classification (A-002)

Completes the gap `technical-inventory.md` flagged: that document maps which domain owns which *model*; this one classifies which *fields* within those models carry sensitive content, so retention/export/deletion rules can attach to the right things instead of a whole table. It does **not** set legal retention periods, export formats, or deletion timelines — those are A-006's job (Privacy/retention/terms/refunds/taxes/export/publisher-agreement requirements, FL-owned) once DEC-005 (launch region) and DEC-006 (connectivity) are accepted. This document is the technical substrate A-006 applies legal rules to.

Most students in this system are minors. Treat that as the default assumption when judging severity, not an edge case.

## Classification tiers

| Tier | Meaning | Default technical posture |
|---|---|---|
| **0 — Public** | Already meant for public view (e.g. a school's public class-registration listing) | No restriction |
| **1 — Internal/Structural** | Operational, not personally identifying on its own (IDs, timestamps, status enums, config) | No special handling; excluded from the per-field lists below because there's nothing to classify |
| **2 — Personal (PII)** | Directly identifies a person: name, contact info, address, photo | Visible only to roles with a legitimate need (already enforced by existing `@Roles()`/ownership checks); included in a "your own data" export; deletable on account closure subject to A-006's retention rule, not deleted by default today |
| **3 — Sensitive Personal** | Exposure has outsized harm beyond simple identification: financial records, attendance/academic history tied to a named minor, disciplinary notes, precise location tracking | Same visibility floor as Tier 2, but **never included in a bulk/administrative export without a specific, logged justification** (a parent exporting their own child's record is fine; a bulk "export all students" for a non-audit purpose is not) |
| **4 — Secret/Credential** | Not personal data — access material (passwords, tokens, keys) | Out of scope here; see [secrets-inventory.md](../operations/secrets-inventory.md) (A-008) |

## Third-party exposure

Independent of tier, a field that is ever sent to an external provider (SendGrid, Twilio, a future payment processor) carries an additional obligation: the provider's own data-handling terms become part of this system's privacy posture. `technical-inventory.md`'s "External providers" table already names which provider sees what class of data (recipient identity + message content for email/SMS); nothing below repeats that, it only flags which specific fields feed those providers.

## Per-model classification

Built from a full read of every model in `backend/prisma/schema.prisma` and `apps/marketplace-api/prisma/schema.prisma`, cross-checked against the actual service code (not just field names) for the plaintext-vs-hashed question. Organized by the same domain buckets as `technical-inventory.md`. Fields not listed (`id`, `createdAt`, `updatedAt`, plain enums/booleans/foreign keys, and structural/branding content like class names or course descriptions) are Tier 1 and carry no special handling. "→ 3rd party" marks a field confirmed (by reading the actual call site, not assumed from its name) to be sent to SendGrid, Twilio, or a payment provider.

### School database (`backend`)

**Identity/access — User, RefreshToken, ParentLinkRequest**

| Field | Tier | Note |
|---|---|---|
| `User.email`, `User.name`, `User.phone`, `User.phoneNormalized` | 2 | Direct PII; `email`/`name`/`phone` also → 3rd party (SendGrid/Twilio recipient + message interpolation) |
| `User.password` | 4 | bcrypt hash (cost 12) — correctly hashed |
| `User.photo` | 3 | Identification photo, biometric-adjacent |
| `RefreshToken.token` | 4 | Session credential — SHA-256 digest at rest (remediated 2026-08-29), see "Known at-rest exposure" below |
| `ParentLinkRequest.parentEmail/parentName/parentPhone` | 2 | Direct PII |
| `ParentLinkRequest.note`, `rejectReason` | 3 | Freeform text, unbounded content |

**Academic structure — Class, Student, StudyYear, Department, Holiday**

| Field | Tier | Note |
|---|---|---|
| `Student.dateOfBirth`, `sex`, `address`, `nameKh` | 2 | Direct PII |
| `Student.studentNumber`, `generation` | 2 | Weakly identifying |
| `Student.photo`, `qrCode` | 3 | Identification photo / physical-card scan credential tied to a named minor |
| `Student.customFieldValues` (Json) | unbounded | Admin-configurable form data — content unknowable from the schema; governance concern, not a fixed tier (see cross-cutting note) |

**Attendance — Attendance, StaffAttendance, SessionConfig, StaffWeeklySchedule, AttendanceFormatRule**

| Field | Tier | Note |
|---|---|---|
| `Attendance`/`StaffAttendance`: `status`, `permissionType`, `permissionStartDate/EndDate`, `checkInTime/checkOutTime` | 3 | Presence/absence record tied to a named person |
| `Attendance`/`StaffAttendance`: `scanLatitude`, `scanLongitude`, `scanLocation` | 3 | Precise location at scan time |

**Audit/governance — AuditLog, AuditCleanupSchedule**

| Field | Tier | Note |
|---|---|---|
| `AuditLog.actorName`, `actorEmail` | 2 | Denormalized PII snapshot, survives actor deletion |
| `AuditLog.resourceLabel` | 2 | Documented as "e.g. student name" |
| `AuditLog.changes` (Json before/after), `metadata` (Json) | **inherits** | Unbounded — mirrors whatever model was touched; see cross-cutting note, this is the highest-leverage indirect-PII field in the schema |
| `AuditLog.ip` | 2 | Requester IP |
| `AuditLog.userAgent` | 2, weak | Device fingerprint |

**Registration/cards — CardAlias, CardTemplate, ClassRegistration, ClassRegistrationSettings, ClassRegistrationField**

| Field | Tier | Note |
|---|---|---|
| `CardAlias.qrValue` | 3 | Physical card code tied to a named student |
| `ClassRegistration.nameKh/nameEn/email/phone/sex/dateOfBirth/address` | 2 | Direct PII; `email` also → 3rd party (approve/reject emails) |
| `ClassRegistration.passwordHash` | 4 | bcrypt hash (cost 12) — correctly hashed |
| `ClassRegistration.generatedPassword` | 4 | **Stored in plaintext, by design** — see "Known at-rest exposure" |
| `ClassRegistration.photo` | 3 | Identification photo, submitted pre-approval by an unauthenticated intake form — highest-exposure surface of any model in this schema |
| `ClassRegistration.customFieldValues` (Json) | unbounded | Same governance concern as `Student.customFieldValues` |
| `ClassRegistration.rejectReason` | 3, weak | Freeform |

**Finance/HR — FeeRecord, FeePayment, FeeSettings, Salary, StaffProfile, StaffEducation, StaffWorkExperience, StaffCertification**

| Field | Tier | Note |
|---|---|---|
| `FeeRecord.totalAmount/discount/paidAmount`, `FeePayment.amount` | 3 | Financial, tied to a named student |
| `FeeRecord.discountReason`, `FeeRecord.notes`, `FeePayment.note` | 3 | Freeform, may reference personal/hardship circumstances |
| `Salary.baseSalary/allowances/deductions/netSalary` | 3 | Compensation tied to a named staff member |
| `Salary.notes` | 3 | Freeform HR commentary |
| `StaffProfile.summary`, `StaffEducation.*`, `StaffWorkExperience.*`, `StaffCertification.*` | 2, weak | Personal professional/educational history |
| `FeeSettings.schoolEmail/schoolPhone/schoolAddress` | — | Not flagged — this is the *school's own* published contact info, not an individual's data |

**Timetable/transport — Timetable, TimetableSubject, TimetableClass, TimetableClassroom, TimetableTeacher, TimetableLesson, TimetableEntry, TimetableTeacherAttendance, Bus, BusRoute, BusStop, BusLocation**

| Field | Tier | Note |
|---|---|---|
| `TimetableTeacher.lastName/firstName/khmerName/sex/email/phone` | 2 | **A second, parallel identity record for staff, separate from `User`** — same PII, needs the same access discipline; easy to miss since it lives in the Timetable bucket, not Identity |
| `TimetableTeacher.photo`, `qrCode` | 3 | Identification photo / scan-attendance credential, same pattern as `Student` |
| `TimetableTeacherAttendance.status`, `checkIn` | 3 | Attendance tied to a named teacher (via `TimetableTeacher`, not `User`) |
| `BusLocation.latitude/longitude/speed/heading` | 3, weak | Real-time vehicle location — indirectly reveals children's movements on a bus route at specific times |

**Learning/assessment — ScoreSheet family, Exam family, Assignment family, Course/LMS family**

| Field | Tier | Note |
|---|---|---|
| `ScoreEntry.score` | 3 | Grade tied to a named student |
| `ExamAttempt.answers/manualMarks/feedback/score/grade` | 3 | Exam performance tied to a named student |
| `AssignmentSubmission.content/attachmentUrl/marks/feedback` | 3 | Submitted work + grading tied to a named student |
| `QuizAnswer.response/pointsAwarded/feedback`, `PageResponse.answer/pointsAwarded` | 3 | Same |
| `LessonAttempt.score/maxScore/passed` | 3 | Same |
| `CourseAttendance.status/checkInTime/notes` | 3 | Attendance tied to a named student |
| `CourseEnrollment.certificateUrl`, `LessonView.watchedSeconds/videoCompleted/openCount` | 3, weak | Credential artifact / behavioral engagement tracking tied to a named student |

**Communication/content — Notification, NotificationPreference, Message, Announcement, AnnouncementRead, Post**

| Field | Tier | Note |
|---|---|---|
| `Notification.message` | 3 | Confirmed by code to be composed with the student's name (e.g. absence alerts) and → 3rd party (same string sent via SendGrid/Twilio); also read by the digest path (`notification-preference/digest.service.ts`), which is itself → 3rd party |
| `Message.content` | 3 | Direct-message body — confirmed in-app/WebSocket only, **not** sent to any 3rd party |
| `Announcement.body`, `title` | 3, weak | Content potentially targeted at a specific class/role. `channels` allows `EMAIL,SMS` but current dispatch has no wiring to a send call — not → 3rd party *today*, revisit if that wiring is added |

**Plugin platform — PluginInstallation, PluginMigration, PluginSetting, PluginJobDefinition, PluginJobRun, PluginPermissionGrant, PluginNotificationUsage, PluginEntitlementCache** — no sensitive fields; all structural/operational plugin metadata, not personal data. `PluginEntitlementCache.signedTokenJson` is a cached signed license artifact (Tier 4-adjacent, not a raw secret).

*(`Installation`, `SiteSetting` — no sensitive fields, school-level org metadata.)*

### Marketplace database (`apps/marketplace-api`)

**Customer identity — MarketplaceAccount, InstallationRegistration, MarketplaceSession, MarketplaceEmailVerification, MarketplacePasswordReset, MarketplaceMfaRecoveryCode, MarketplaceAuditEvent**

| Field | Tier | Note |
|---|---|---|
| `MarketplaceAccount.email`, `displayName` | 2 | Direct PII |
| `MarketplaceAccount.passwordHash` | 4 | Correctly hashed |
| `MarketplaceAccount.mfaSecret` | 4 | Encrypted at rest, AES-256-GCM (remediated 2026-08-29) — see "Known at-rest exposure" |
| `MarketplaceSession.tokenHash`, `MarketplaceEmailVerification.tokenHash`, `MarketplacePasswordReset.tokenHash`, `MarketplaceMfaRecoveryCode.codeHash` | 4 | All correctly hashed — now the norm this schema follows throughout, `mfaSecret` included |
| `MarketplaceAuditEvent.ip` | 2 | Requester IP |
| `MarketplaceAuditEvent.metadata` (Json) | inherits | Same indirect-PII amplification risk as the school `AuditLog` |

**Publisher governance — Publisher, PublisherKey, PublisherMember, PublisherPolicy, PublisherPolicyAcceptance, PluginSubmission, SubmissionReview**

| Field | Tier | Note |
|---|---|---|
| `PublisherPolicyAcceptance.ip` | 2 | Direct PII |
| `PublisherKey.publicKeyPem` | — | Not flagged — public half of a signing keypair, integrity-sensitive not confidential |
| `PluginSubmission.analysisReport`, `SubmissionReview.notes/evidence` | — | Not flagged — security-review content about a package, not personal data |

**Catalog/review — MarketplacePlugin, PluginVersion, VersionReview, ProductPrice** — `ProductPrice.amountMinor` is Tier 3 (weak — a list price, not a transaction); nothing else flagged.

**Commerce — MarketplaceOrder, MarketplaceOrderLine, MarketplacePayment, PaymentWebhookEvent, MarketplaceRefund, MarketplacePaymentDispute**

| Field | Tier | Note |
|---|---|---|
| `MarketplaceOrder.totalMinor`, `MarketplaceOrderLine.unitPriceMinor`, `MarketplacePayment.amountMinor`, `MarketplaceRefund.amountMinor` | 3 | Financial |
| `MarketplacePayment.provider/providerRef` | 3 | → 3rd party (payment-processor transaction reference) |
| `PaymentWebhookEvent.rawPayload` | 3 | **Highest-risk field in Commerce** — full raw provider payload, unbounded content, → 3rd party by definition |
| `PaymentWebhookEvent.signature` | 4 | Provider-issued verification value, replay-sensitive |
| `MarketplaceRefund.reason`, `MarketplacePaymentDispute.reason` | 3, weak | Freeform, may reference dispute detail |
| `MarketplacePaymentDispute.providerDisputeRef` | 3 | → 3rd party reference |

**Licensing — InstallationEntitlement** — `signedToken` (Json) is a controlled, tamper-sensitive artifact (Tier 4-adjacent), not a raw secret; private signing key lives outside this database per `secrets-inventory.md`.

**Publisher finance/payouts — PublisherRevenueEntry, PublisherStatement, PublisherStatementLine, PublisherPayout, PublisherPayoutLine**

| Field | Tier | Note |
|---|---|---|
| `PublisherRevenueEntry.grossMinor/feeMinor/taxMinor/netMinor` | 3 | Financial |
| `PublisherRevenueEntry.description` | 3, weak | Freeform, may reference order/customer context |
| `PublisherStatement.grossMinor/feeMinor/taxMinor/netMinor` | 3 | Financial |
| `PublisherPayout.amountMinor` | 3 | Financial |
| `PublisherPayout.providerReference` | 3 | → 3rd party payout reference |

## Ownership-table gaps found and fixed during this audit

`technical-inventory.md`'s ownership tables predated several models added to `schema.prisma` since it was last reconciled. Fixed in the same change as this document rather than left open:

- **School "Finance/HR" row** was missing `FeeSettings`; **"Plugin platform" row** was missing `PluginNotificationUsage` and `PluginEntitlementCache`. Both added.
- **Marketplace table** had no row at all for `MarketplaceSession`, `MarketplaceEmailVerification`, `MarketplacePasswordReset`, `MarketplaceMfaRecoveryCode`, `MarketplaceAuditEvent`, `InstallationRegistrationKey`, `InstallationRegistrationChallenge` (added to Customer identity), `PublisherMember`, `PublisherPolicy`, `PublisherPolicyAcceptance`, `PluginSubmission`, `SubmissionReview` (added to Publisher governance), `ProductPrice` (added to Catalog/review), or the five publisher finance/payout models above (added as a new "Publisher finance/payouts" bucket). All added; verified zero unowned models remain by diffing every `model` declaration in both `schema.prisma` files against the ownership tables.
- **`technical-inventory.md`'s "External providers" table said Payment was "not selected / none yet"** — stale, since `MarketplacePayment`, `PaymentWebhookEvent`, and the verified E-007/E-008/E-009 manual-invoice and webhook adapters already implement a live payment-provider integration shape. Corrected to say the manual/webhook adapter exists, with a real card-network processor still unselected.

## Cross-cutting observations

1. **Freeform text fields are an unbounded classification risk.** `FeeRecord.notes/discountReason`, `FeePayment.note`, `Salary.notes`, `ParentLinkRequest.note/rejectReason`, `CourseAttendance.notes`, `StaffWorkExperience.description`, `MarketplaceRefund.reason`, `MarketplacePaymentDispute.reason` could all incidentally capture health, disciplinary, or other highly sensitive content even though none are purpose-built for it. No dedicated health/disciplinary field exists anywhere in either schema today — the risk is entirely in what a human types into these boxes. This needs a free-text handling policy from A-006, not a per-field fix.
2. **`customFieldValues` on `Student` and `ClassRegistration`** are admin-configurable JSON blobs (`ClassRegistrationField` defines the shape) — sensitivity is inherently unknowable from the schema. Governance belongs on *what admins are allowed to configure*, not a fixed tier here.
3. **`AuditLog.changes`/`AuditLog.metadata`** (school) and **`MarketplaceAuditEvent.metadata`** (marketplace) inherit the classification of whatever they're snapshotting — since audit logs capture before/after state of any mutation, they are, in effect, a second unbounded copy of every Tier 2/3 field in the system with its own separate retention/access question.
4. **`TimetableTeacher` duplicates core staff PII** (name, email, phone, photo, QR code) as a second, separate record from `User`. Any access-control or export/deletion rule applied to staff PII needs to reach this model too — it's easy to miss because it's owned by "Timetable/transport," not "Identity/access."

## Known at-rest exposure

Of the three fields originally found stored without the hashing/encryption their peers use, two are now remediated (2026-08-29) — confirmed by reading the actual service code, not just field names:

| Field | Status | Why it matters |
|---|---|---|
| `RefreshToken.token` (school) | **Remediated** — new writes store only a SHA-256 digest, rotation is atomic, and presenting an already-rotated token revokes every active session on the account; live-verified on disposable PostgreSQL 16 ([gate-security-refresh-token-custody-2026-08-29.md](../acceptance/gate-security-refresh-token-custody-2026-08-29.md)) | Previously the one real inconsistency with the marketplace's already-hashed `MarketplaceSession.tokenHash`; that asymmetry is now closed. A nullable legacy column remains only for one-use compatibility with sessions issued before the fix and can be dropped after the maximum refresh-token lifetime. |
| `ClassRegistration.generatedPassword` (school) | **Still plaintext, by design** (so an admin can relay it to the registrant) — this one was never a gap to fix | The same row also has a correctly-hashed `passwordHash` — the plaintext copy is a deliberate, disclosed duplication of the credential at rest, not an oversight. |
| `MarketplaceAccount.mfaSecret` | **Remediated** — encrypted at rest (AES-256-GCM via `IDENTITY_ENCRYPTION_KEYS_JSON`, `encryptSecret`/`decryptSecret` in `identity.service.ts`), with self-healing key rotation live-verified end to end | Every other marketplace secret in this schema (`tokenHash`, `codeHash`, `passwordHash`) was already protected at rest; this was the one gap, structurally requiring encryption rather than hashing since verifying a TOTP code means recomputing the HMAC. |

Real engineering closed the two genuine gaps here since this document was first written — this file wasn't updated in step, which a later full-checklist audit caught. `ClassRegistration.generatedPassword` was never actually a gap to begin with, just a disclosed design tradeoff.

## Change rule

A new sensitive field is classified in the same change that adds it — same discipline as `technical-inventory.md`'s model-level rule. When A-006 sets actual retention/export/deletion periods, it should reference tiers here rather than re-deriving field lists from scratch.
