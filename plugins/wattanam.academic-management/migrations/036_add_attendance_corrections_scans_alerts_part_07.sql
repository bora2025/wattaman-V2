-- wattanam-plugin-migration: 036_add_attendance_corrections_scans_alerts_part_07
CREATE TABLE IF NOT EXISTS "plugin_wattanam_academic_management_attendance_alert_rule" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "threshold" INTEGER NOT NULL CHECK ("threshold" > 0),
  "windowDays" INTEGER NOT NULL CHECK ("windowDays" > 0),
  "channels" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
)
;

