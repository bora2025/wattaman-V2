-- wattanam-plugin-migration: 001_create_timetable
CREATE TABLE plugin_wattanam_timetable_document (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "short" TEXT,
  "academicYear" TEXT NOT NULL,
  "periodsPerDay" INTEGER NOT NULL DEFAULT 8 CHECK ("periodsPerDay" BETWEEN 1 AND 24),
  "numberOfDays" INTEGER NOT NULL DEFAULT 5 CHECK ("numberOfDays" BETWEEN 1 AND 7),
  "weekend" JSONB NOT NULL DEFAULT '["SATURDAY","SUNDAY"]'::jsonb,
  "periodTimes" JSONB,
  "timeOffRules" JSONB,
  "distribution" JSONB,
  "homeworkPrep" JSONB,
  "maxOnDay" INTEGER,
  "docNotes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT','PUBLISHED')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
