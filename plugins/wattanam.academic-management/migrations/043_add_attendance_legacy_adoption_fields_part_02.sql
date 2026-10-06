-- wattanam-plugin-migration: 043_add_attendance_legacy_adoption_fields_part_02
ALTER TABLE "plugin_wattanam_academic_management_attendance_identifier"
  ADD COLUMN IF NOT EXISTS "createdById" TEXT
;

