-- wattanam-plugin-migration: 065_index_employee_positionid
-- Covering index for a foreign key, so joins, cascades and parent deletes do not scan the table.
CREATE INDEX IF NOT EXISTS plugin_wattanam_organizing_management_employee_positionid_idx ON plugin_wattanam_organizing_management_employee ("positionId");
