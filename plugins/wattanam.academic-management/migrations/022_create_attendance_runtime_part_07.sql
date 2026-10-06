-- wattanam-plugin-migration: 022_create_attendance_runtime_part_07
CREATE TABLE IF NOT EXISTS plugin_wattanam_academic_management_attendance_record (
  "id" TEXT PRIMARY KEY,
  "personId" TEXT NOT NULL,
  "personType" TEXT NOT NULL CHECK ("personType" IN ('STUDENT', 'TEACHER', 'STAFF')),
  "classId" TEXT,
  "studyYearId" TEXT REFERENCES plugin_wattanam_academic_management_study_year("id"),
  "date" DATE NOT NULL,
  "session" INTEGER NOT NULL CHECK ("session" BETWEEN 1 AND 4),
  "status" TEXT NOT NULL CHECK ("status" IN ('PRESENT', 'LATE', 'ABSENT', 'PERMISSION')),
  "permissionType" TEXT,
  "checkInTime" TIMESTAMPTZ,
  "checkOutTime" TIMESTAMPTZ,
  "markedById" TEXT NOT NULL,
  "scanMode" TEXT CHECK ("scanMode" IN ('CAMERA', 'USB', 'MANUAL')),
  "scanLatitude" DOUBLE PRECISION,
  "scanLongitude" DOUBLE PRECISION,
  "scanLocation" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("personType", "personId", "classId", "date", "session")
)
;

