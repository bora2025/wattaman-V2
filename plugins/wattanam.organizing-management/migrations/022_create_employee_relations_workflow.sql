-- wattanam-plugin-migration: 022_create_employee_relations_workflow
ALTER TABLE plugin_wattanam_organizing_management_payroll_record
  ADD COLUMN "permissionDays" INTEGER NOT NULL DEFAULT 0 CHECK ("permissionDays" >= 0);
