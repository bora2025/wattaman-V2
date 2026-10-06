CREATE TABLE IF NOT EXISTS plugin_wattanam_academic_management_study_year (
  "id" TEXT PRIMARY KEY,
  "year" INTEGER NOT NULL UNIQUE,
  "label" TEXT,
  "startDate" TIMESTAMPTZ,
  "endDate" TIMESTAMPTZ,
  "isCurrent" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS plugin_wattanam_academic_management_attendance_one_current_year
  ON plugin_wattanam_academic_management_study_year ("isCurrent") WHERE "isCurrent" = TRUE;

CREATE TABLE IF NOT EXISTS plugin_wattanam_academic_management_attendance_session (
  "id" TEXT PRIMARY KEY,
  "scope" TEXT NOT NULL CHECK ("scope" IN ('STUDENT', 'TEACHER', 'STAFF')),
  "classId" TEXT NOT NULL DEFAULT '',
  "session" INTEGER NOT NULL CHECK ("session" BETWEEN 1 AND 4),
  "type" TEXT NOT NULL CHECK ("type" IN ('CHECK_IN', 'CHECK_OUT')),
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("scope", "classId", "session")
);

CREATE TABLE IF NOT EXISTS plugin_wattanam_academic_management_attendance_holiday (
  "id" TEXT PRIMARY KEY,
  "date" DATE NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "type" TEXT NOT NULL DEFAULT 'HOLIDAY',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("date", "name")
);

CREATE TABLE IF NOT EXISTS plugin_wattanam_academic_management_attendance_identifier (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "personId" TEXT NOT NULL,
  "personType" TEXT NOT NULL CHECK ("personType" IN ('STUDENT', 'TEACHER', 'STAFF')),
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS plugin_wattanam_academic_management_attendance_identifier_person
  ON plugin_wattanam_academic_management_attendance_identifier ("personType", "personId");

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
);

CREATE INDEX IF NOT EXISTS plugin_wattanam_academic_management_attendance_record_date
  ON plugin_wattanam_academic_management_attendance_record ("date");
CREATE INDEX IF NOT EXISTS plugin_wattanam_academic_management_attendance_record_person
  ON plugin_wattanam_academic_management_attendance_record ("personType", "personId", "date");
CREATE INDEX IF NOT EXISTS plugin_wattanam_academic_management_attendance_record_class
  ON plugin_wattanam_academic_management_attendance_record ("classId", "date");


