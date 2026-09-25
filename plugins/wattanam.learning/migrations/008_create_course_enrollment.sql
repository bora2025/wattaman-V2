-- wattanam-plugin-migration: 008_create_course_enrollment
CREATE TABLE plugin_wattanam_learning_course_enrollment (
  "id" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL REFERENCES plugin_wattanam_learning_course("id") ON DELETE CASCADE,
  "academicStudentId" TEXT NOT NULL, "directoryUserId" TEXT, "status" TEXT NOT NULL DEFAULT 'ENROLLED' CHECK ("status" IN ('ENROLLED','ACTIVE','COMPLETED','DROPPED')),
  "progressPct" DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK ("progressPct" BETWEEN 0 AND 100), "enrolledAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ, "certificateUrl" TEXT, UNIQUE ("courseId","academicStudentId")
);
