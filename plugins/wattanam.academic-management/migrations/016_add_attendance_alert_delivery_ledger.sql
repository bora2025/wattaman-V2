-- wattanam-plugin-migration: 005_add_alert_delivery_ledger
CREATE TABLE IF NOT EXISTS "plugin_wattanam_academic_management_attendance_alert_delivery" (
  "id" TEXT PRIMARY KEY,
  "alertId" TEXT NOT NULL REFERENCES "plugin_wattanam_academic_management_attendance_alert"("id") ON DELETE RESTRICT,
  "userId" TEXT NOT NULL,
  "channel" TEXT NOT NULL CHECK ("channel" IN ('IN_APP', 'REALTIME')),
  "status" TEXT NOT NULL CHECK ("status" IN ('PENDING', 'SENT', 'FAILED')),
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "lastError" TEXT,
  "sentAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("alertId", "userId", "channel")
);

CREATE INDEX IF NOT EXISTS "academic_management_attendance_alert_delivery_status"
  ON "plugin_wattanam_academic_management_attendance_alert_delivery" ("status", "updatedAt");


