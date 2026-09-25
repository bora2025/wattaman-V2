-- wattanam-plugin-migration: 009_create_student_profile
CREATE TABLE "plugin_wattanam_academic_management_student_profile" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE,
  "studentNumber" TEXT,
  "guardianUserId" TEXT,
  "qrCode" TEXT UNIQUE,
  "photo" TEXT,
  "sex" TEXT,
  "dateOfBirth" DATE,
  "address" TEXT,
  "generation" TEXT,
  "nameKh" TEXT,
  "customFieldValues" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "source" TEXT NOT NULL DEFAULT 'plugin',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academic_student_sex" CHECK ("sex" IS NULL OR "sex" IN ('MALE', 'FEMALE', 'OTHER')),
  CONSTRAINT "academic_student_source" CHECK ("source" IN ('plugin', 'legacy-adoption', 'registration'))
);
