-- wattanam-plugin-migration: 010_create_workforce_calendar_workflow
ALTER TABLE plugin_wattanam_organizing_management_employee
  ADD COLUMN "positionId" TEXT REFERENCES plugin_wattanam_organizing_management_position("id");
