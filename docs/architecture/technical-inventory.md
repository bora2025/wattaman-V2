# Wattanam V2 Technical Ownership Inventory

Status: reviewed baseline, 2026-08-28. This inventory is generated from the current repository and is the Phase A ownership source. Field-level privacy classification is tracked as remaining work until every schema field is classified.

## Deployable systems

| System | Source | Runtime | Persistence | Owner | Boundary |
|---|---|---|---|---|---|
| School API | `backend` | Node 20, NestJS 10 | School PostgreSQL and `/data` | Platform Lead | School data and plugin host; no marketplace private keys |
| School web | `frontend` | Node 20, Next.js 14 | none | Frontend Engineer | Same-origin browser UI; server proxy reaches private API |
| School mobile | `apps/mobile` | Expo 55, React Native 0.83 | device secure storage/cache | Mobile owner | Versioned school API consumer; no direct database access |
| Gateway | `infrastructure/gateway` | Caddy 2.10 | none | SRE | Only public Railway service; routes web/API/socket traffic |
| Marketplace API | `apps/marketplace-api` | Node 20, Express | Marketplace PostgreSQL and artifact volume | Marketplace Backend | Accounts, publishers, catalog, repository, commerce, entitlements |
| Announcements plugin | `plugins/announcements` | Signed server package | Namespaced DB/settings/files/jobs | Plugin Platform | SDK reference; legacy data remains core-owned until cutover |

The school installation and marketplace never share a database, secret, volume, or administrator identity.

## School database ownership

| Domain owner | Models |
|---|---|
| Identity/access | User, RefreshToken, ParentLinkRequest |
| Academic structure | Class, Student, StudyYear, Department, Holiday |
| Attendance | Attendance, StaffAttendance, SessionConfig, StaffWeeklySchedule, AttendanceFormatRule |
| Audit/governance | AuditLog, AuditCleanupSchedule |
| Registration/cards | CardAlias, CardTemplate, ClassRegistration, ClassRegistrationSettings, ClassRegistrationField |
| Finance/HR | FeeRecord, FeePayment, FeeSettings, Salary, StaffProfile, StaffEducation, StaffWorkExperience, StaffCertification |
| Timetable/transport | Timetable, TimetableSubject, TimetableClass, TimetableClassroom, TimetableTeacher, TimetableLesson, TimetableEntry, TimetableTeacherAttendance, Bus, BusRoute, BusStop, BusLocation |
| Learning/assessment | ScoreSheet, ScoreSheetClass, ScoreSubject, ScoreExamTab, ScoreEntry, Exam, ExamQuestion, ExamAttempt, Assignment, AssignmentSubmission, QuizQuestion, QuizAnswer, Course, CourseLesson, LessonPage, CourseEnrollment, LessonAttempt, PageResponse, CourseSession, CourseAttendance, LessonView |
| Communication/content | Notification, NotificationPreference, Message, Announcement, AnnouncementRead, Post |
| Installation/core settings | Installation, SiteSetting |
| Plugin platform | PluginInstallation, PluginMigration, PluginSetting, PluginJobDefinition, PluginJobRun |

No plugin may write a core-owned model. Plugin tables must use the enforced `plugin_<plugin-id>_*` namespace. Announcements remain core-owned until C-004 records a single-writer cutover and comparison report.

## Marketplace database ownership

| Domain owner | Models |
|---|---|
| Customer identity | MarketplaceAccount, InstallationRegistration |
| Publisher governance | Publisher, PublisherKey |
| Catalog/review | MarketplacePlugin, PluginVersion, VersionReview |
| Repository/security | PackageArtifact, CoreRelease, SecurityAdvisory, DownloadEvent |
| Commerce | MarketplaceOrder, MarketplaceOrderLine, MarketplacePayment, PaymentWebhookEvent |
| Licensing | InstallationEntitlement |

## Persistent files

| Path/class | Writer | Backup/retention | Sensitivity |
|---|---|---|---|
| School PostgreSQL volume | PostgreSQL | Required recovery set; school retention policy | restricted school data |
| `/data/backups` | API/operations command | retention days plus offsite policy | restricted, encrypted offsite |
| `/data/plugins` | Plugin installer | versioned with registry; included in recovery set | trusted executable packages |
| `/data/plugin-data/<id>` | Scoped plugin storage | preserved on uninstall; included in recovery set | inherits plugin data classification |
| Marketplace PostgreSQL | Marketplace API | independent encrypted backup | commercial/account data |
| `/data/artifacts` | Marketplace repository | immutable by digest; replicated before production | public packages after release, restricted before approval |
| Mobile secure storage | Mobile app | cleared on logout/session revocation | credentials/tokens |

Publisher and repository private signing keys are secret-manager inputs, never school files and never committed. Temporary package files must be created exclusively and removed after success or failure.

## Configuration ownership

| Class | Variables | Owner | Rule |
|---|---|---|---|
| Core required | NODE_ENV, PORT, DATABASE_URL, JWT_SECRET, CORS_ORIGINS | Platform/SRE | validate before startup; secrets never logged |
| Release identity | APP_VERSION, GIT_COMMIT, RAILWAY_GIT_COMMIT_SHA | Release Engineering | immutable release metadata |
| Authentication | COOKIE_SECURE, JWT_ACCESS_EXPIRY, JWT_REFRESH_EXPIRY | Security | secure production defaults; expiry changes reviewed |
| Backup | BACKUP_DIR, BACKUP_RETENTION_DAYS | SRE | must resolve below persistent storage in production |
| Plugin runtime | PLUGIN_DIR, PLUGIN_DATA_DIR, PLUGIN_SAFE_MODE, PLUGIN_MAX_PACKAGE_BYTES, PLUGIN_MAX_UNPACKED_BYTES, PLUGIN_STORAGE_MAX_FILE_BYTES | Plugin Platform | bounded values and persistent paths |
| Plugin trust | PLUGIN_TRUSTED_KEYS_FILE, PLUGIN_TRUSTED_KEYS | Security | public keys only; rotation recorded |
| Updates | MARKETPLACE_URL, UPDATE_CHANNEL, UPDATE_REPOSITORY_KEY_ID, UPDATE_REPOSITORY_PUBLIC_KEY_FILE, UPDATE_REPOSITORY_PUBLIC_KEY | Release Engineering | HTTPS production URL and pinned key identity |
| Notifications | SENDGRID_API_KEY, SENDGRID_FROM, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER | Integrations | optional adapters; credentials sealed/redacted |
| Web | API_URL, NEXT_PUBLIC_API_URL, PORT | Frontend/SRE | private server URL; browser URL empty for same-origin deployment |
| Gateway | API_UPSTREAM, WEB_UPSTREAM | SRE | private Railway/Docker endpoints only |
| Marketplace | DATABASE_URL, PUBLIC_BASE_URL, MARKETPLACE_ADMIN_TOKEN, METADATA_SIGNING_PRIVATE_KEY_FILE, METADATA_SIGNING_PRIVATE_KEY, METADATA_SIGNING_KEY_ID, ARTIFACT_STORAGE_PATH, MAX_ARTIFACT_BYTES | Marketplace/Security | validated at startup; HTTPS and managed signing custody in production |

Known gap: optional core variables are still read directly by feature modules. A-008 centralizes schemas, bounds, secrecy labels, and redaction tests before Gate A1.

## External providers

| Provider class | Current adapter | Data sent | Outage behavior |
|---|---|---|---|
| Email | SendGrid | recipient, configured message | operation skips/fails visibly; core remains available |
| SMS | Twilio | recipient phone, configured message | operation skips/fails visibly; core remains available |
| Railway | project/services/private DNS/domain | operational metadata | installed school continues locally except hosting outage |
| Payment | not selected | none yet | no paid fulfillment until E gates |
| Object storage | local/Railway volume | plugin/artifact files | S3 adapter remains B-015 |

## Contract surfaces

- School REST and Socket.IO: Nest controllers/gateways under `backend/src`; catalog generation is A-010.
- Plugin package/runtime: `backend/src/plugins` and `docs/plugins/package-and-runtime.md`.
- Marketplace repository envelopes: `apps/marketplace-api/src` and `docs/marketplace/official-repository.md`.
- Browser server proxy: `frontend/app/api/[...path]/route.ts`.
- Mobile consumer: `apps/mobile`; API compatibility fixture remains A-010/B-014.

## Change rule

Every new database model, persistent path, provider, environment variable, or public endpoint must update this inventory in the same change. Unowned production state fails Gate A1.
