-- wattanam-plugin-migration: 042_add_attendance_legacy_adoption_fields_part_01
ALTER TABLE "plugin_wattanam_academic_management_attendance_record"
  ADD COLUMN IF NOT EXISTS "permissionStartDate" DATE,
  ADD COLUMN IF NOT EXISTS "permissionEndDate" DATE
;

