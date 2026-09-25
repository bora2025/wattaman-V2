-- wattanam-plugin-migration: 005_create_course
CREATE TABLE plugin_wattanam_learning_course (
  "id" TEXT PRIMARY KEY, "title" TEXT NOT NULL, "description" TEXT, "category" TEXT, "academicClassId" TEXT NOT NULL, "createdByDirectoryUserId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT','PUBLISHED','ENROLLMENT','ACTIVE','COMPLETED','ARCHIVED')),
  "enrollmentOpen" BOOLEAN NOT NULL DEFAULT FALSE, "startDate" TIMESTAMPTZ, "endDate" TIMESTAMPTZ, "publishedAt" TIMESTAMPTZ,
  "archivedAt" TIMESTAMPTZ, "completedAt" TIMESTAMPTZ, "coverImageUrl" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("endDate" IS NULL OR "startDate" IS NULL OR "endDate" >= "startDate")
);
