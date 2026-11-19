-- wattanam-plugin-migration: 093_add_student_details
ALTER TABLE plugin_wattanam_academic_management_student_profile
  ADD COLUMN IF NOT EXISTS "birthVillage" TEXT,
  ADD COLUMN IF NOT EXISTS "birthCommune" TEXT,
  ADD COLUMN IF NOT EXISTS "birthDistrict" TEXT,
  ADD COLUMN IF NOT EXISTS "birthProvince" TEXT,
  ADD COLUMN IF NOT EXISTS "houseNo" TEXT,
  ADD COLUMN IF NOT EXISTS "street" TEXT,
  ADD COLUMN IF NOT EXISTS "village" TEXT,
  ADD COLUMN IF NOT EXISTS "commune" TEXT,
  ADD COLUMN IF NOT EXISTS "district" TEXT,
  ADD COLUMN IF NOT EXISTS "province" TEXT,
  ADD COLUMN IF NOT EXISTS "fatherName" TEXT,
  ADD COLUMN IF NOT EXISTS "fatherJob" TEXT,
  ADD COLUMN IF NOT EXISTS "fatherPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "motherName" TEXT,
  ADD COLUMN IF NOT EXISTS "motherJob" TEXT,
  ADD COLUMN IF NOT EXISTS "motherPhone" TEXT;
