-- wattanam-plugin-migration: 005_create_profiles_and_print_settings
ALTER TABLE plugin_wattanam_organizing_management_employee
  ADD COLUMN "dateOfBirth" DATE,
  ADD COLUMN "gender" TEXT,
  ADD COLUMN "nationalId" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "emergencyContactName" TEXT,
  ADD COLUMN "emergencyContactPhone" TEXT,
  ADD COLUMN "notes" TEXT;

CREATE TABLE plugin_wattanam_organizing_management_report_setting (
  "id" TEXT PRIMARY KEY,
  "organizationName" TEXT NOT NULL,
  "organizationAddress" TEXT,
  "logoUrl" TEXT,
  "reportTitle" TEXT NOT NULL DEFAULT 'Workforce Report',
  "headerText" TEXT,
  "footerText" TEXT,
  "signerName" TEXT,
  "signerTitle" TEXT,
  "paperSize" TEXT NOT NULL DEFAULT 'A4' CHECK ("paperSize" IN ('A4','LETTER','LEGAL')),
  "orientation" TEXT NOT NULL DEFAULT 'PORTRAIT' CHECK ("orientation" IN ('PORTRAIT','LANDSCAPE')),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
