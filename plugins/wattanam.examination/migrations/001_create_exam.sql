-- wattanam-plugin-migration: 001_create_exam
CREATE TABLE plugin_wattanam_examination_exam (
  "id" TEXT PRIMARY KEY, "title" TEXT NOT NULL, "description" TEXT,
  "academicClassId" TEXT, "createdByDirectoryUserId" TEXT NOT NULL,
  "startTime" TIMESTAMPTZ, "endTime" TIMESTAMPTZ,
  "duration" INTEGER NOT NULL DEFAULT 60 CHECK ("duration" > 0),
  "totalMarks" DOUBLE PRECISION NOT NULL DEFAULT 100 CHECK ("totalMarks" >= 0),
  "passMark" DOUBLE PRECISION NOT NULL DEFAULT 50 CHECK ("passMark" >= 0),
  "maxAttempts" INTEGER NOT NULL DEFAULT 1 CHECK ("maxAttempts" >= 0),
  "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT','PUBLISHED','ACTIVE','COMPLETED')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("endTime" IS NULL OR "startTime" IS NULL OR "endTime" >= "startTime")
);
