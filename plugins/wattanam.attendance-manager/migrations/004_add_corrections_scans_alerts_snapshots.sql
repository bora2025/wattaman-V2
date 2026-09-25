-- wattanam-plugin-migration: 004_add_corrections_scans_alerts_snapshots
ALTER TABLE "plugin_wattanam_attendance_manager_record"
  ADD COLUMN IF NOT EXISTS "personNameSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "personNumberSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "classNameSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "studyYearLabelSnapshot" TEXT;

CREATE TABLE IF NOT EXISTS "plugin_wattanam_attendance_manager_correction" (
  "id" TEXT PRIMARY KEY,
  "recordId" TEXT NOT NULL REFERENCES "plugin_wattanam_attendance_manager_record"("id") ON DELETE RESTRICT,
  "actorId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "previousValue" JSONB NOT NULL,
  "newValue" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "attendance_manager_correction_record_created"
  ON "plugin_wattanam_attendance_manager_correction" ("recordId", "createdAt");

CREATE TABLE IF NOT EXISTS "plugin_wattanam_attendance_manager_scan" (
  "id" TEXT PRIMARY KEY,
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "codeHash" TEXT NOT NULL,
  "mode" TEXT NOT NULL CHECK ("mode" IN ('CAMERA', 'USB')),
  "principalId" TEXT NOT NULL,
  "clientTimestamp" TIMESTAMPTZ,
  "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "outcome" TEXT NOT NULL CHECK ("outcome" IN ('ACCEPTED', 'REJECTED', 'DUPLICATE')),
  "recordId" TEXT REFERENCES "plugin_wattanam_attendance_manager_record"("id") ON DELETE SET NULL,
  "errorCode" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS "attendance_manager_scan_principal_received"
  ON "plugin_wattanam_attendance_manager_scan" ("principalId", "receivedAt");
CREATE INDEX IF NOT EXISTS "attendance_manager_scan_code_received"
  ON "plugin_wattanam_attendance_manager_scan" ("codeHash", "receivedAt");

CREATE TABLE IF NOT EXISTS "plugin_wattanam_attendance_manager_alert_rule" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "threshold" INTEGER NOT NULL CHECK ("threshold" > 0),
  "windowDays" INTEGER NOT NULL CHECK ("windowDays" > 0),
  "channels" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "plugin_wattanam_attendance_manager_alert" (
  "id" TEXT PRIMARY KEY,
  "ruleId" TEXT NOT NULL REFERENCES "plugin_wattanam_attendance_manager_alert_rule"("id") ON DELETE RESTRICT,
  "personId" TEXT NOT NULL,
  "classId" TEXT,
  "windowStart" DATE NOT NULL,
  "windowEnd" DATE NOT NULL,
  "status" TEXT NOT NULL CHECK ("status" IN ('PENDING', 'SENT', 'FAILED', 'ACKNOWLEDGED', 'CANCELLED')),
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "lastError" TEXT,
  "sentAt" TIMESTAMPTZ,
  "acknowledgedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("windowEnd" >= "windowStart")
);

CREATE INDEX IF NOT EXISTS "attendance_manager_alert_status_created"
  ON "plugin_wattanam_attendance_manager_alert" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "attendance_manager_alert_person_window"
  ON "plugin_wattanam_attendance_manager_alert" ("personId", "windowStart", "windowEnd");
