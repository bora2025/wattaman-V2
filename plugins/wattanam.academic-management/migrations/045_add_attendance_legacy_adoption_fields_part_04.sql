-- wattanam-plugin-migration: 045_add_attendance_legacy_adoption_fields_part_04
ALTER TABLE "plugin_wattanam_academic_management_attendance_record"
  ADD CONSTRAINT "academic_management_attendance_permission_date_order"
  CHECK ("permissionEndDate" IS NULL OR "permissionStartDate" IS NULL OR "permissionEndDate" >= "permissionStartDate") NOT VALID
;

