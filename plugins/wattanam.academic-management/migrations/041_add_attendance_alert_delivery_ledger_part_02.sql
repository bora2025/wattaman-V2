-- wattanam-plugin-migration: 041_add_attendance_alert_delivery_ledger_part_02
CREATE INDEX IF NOT EXISTS "academic_management_attendance_alert_delivery_status"
  ON "plugin_wattanam_academic_management_attendance_alert_delivery" ("status", "updatedAt")
;

