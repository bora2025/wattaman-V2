-- wattanam-plugin-migration: 087_create_student_permission
CREATE TABLE IF NOT EXISTS plugin_wattanam_academic_management_student_permission (
  "id" TEXT PRIMARY KEY,
  "studentId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "fromDate" DATE NOT NULL,
  "toDate" DATE NOT NULL,
  "part" TEXT NOT NULL CHECK ("part" IN ('MORNING', 'AFTERNOON', 'FULL_DAY')),
  "reason" TEXT NOT NULL,
  "days" INTEGER NOT NULL DEFAULT 0,
  "sessions" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("toDate" >= "fromDate")
);
