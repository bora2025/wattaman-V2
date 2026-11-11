-- wattanam-plugin-migration: 067_index_user_department_departmentid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_academic_management_user_departmen_4628d994_idx ON plugin_wattanam_academic_management_user_department ("departmentId");
