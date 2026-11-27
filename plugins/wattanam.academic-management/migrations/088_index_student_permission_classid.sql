-- wattanam-plugin-migration: 088_index_student_permission_classid
CREATE INDEX IF NOT EXISTS plugin_wattanam_academic_management_student_permission_classid_idx ON plugin_wattanam_academic_management_student_permission ("classId", "fromDate" DESC);
