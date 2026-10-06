-- wattanam-plugin-migration: 037_add_attendance_corrections_scans_alerts_part_08
CREATE TABLE IF NOT EXISTS "plugin_wattanam_academic_management_attendance_alert" (
  "id" TEXT PRIMARY KEY,
  "ruleId" TEXT NOT NULL REFERENCES "plugin_wattanam_academic_management_attendance_alert_rule"("id") ON DELETE RESTRICT,
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
)
;

