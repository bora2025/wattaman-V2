-- wattanam-plugin-migration: 023_create_employee_relations_workflow
CREATE TABLE plugin_wattanam_organizing_management_disciplinary_action (
  "id" TEXT PRIMARY KEY,
  "employeeId" TEXT NOT NULL REFERENCES plugin_wattanam_organizing_management_employee("id"),
  "actionType" TEXT NOT NULL CHECK ("actionType" IN ('VERBAL_WARNING','WRITTEN_WARNING','FINAL_WARNING','SUSPENSION','TERMINATION_RECOMMENDATION','OTHER')),
  "incidentDate" DATE NOT NULL,
  "effectiveDate" DATE NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('DRAFT','ACTIVE','RESOLVED','VOID')),
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
