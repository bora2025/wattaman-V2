-- wattanam-plugin-migration: 029_create_profiles_and_print_settings
ALTER TABLE plugin_wattanam_organizing_management_employee
  ADD COLUMN "dateOfBirth" DATE,
  ADD COLUMN "gender" TEXT,
  ADD COLUMN "nationalId" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "emergencyContactName" TEXT,
  ADD COLUMN "emergencyContactPhone" TEXT,
  ADD COLUMN "notes" TEXT;
