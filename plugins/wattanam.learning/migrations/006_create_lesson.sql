-- wattanam-plugin-migration: 006_create_lesson
CREATE TABLE plugin_wattanam_learning_lesson (
  "id" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL REFERENCES plugin_wattanam_learning_course("id") ON DELETE CASCADE, "title" TEXT NOT NULL, "description" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0 CHECK ("order" >= 0), "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT','PUBLISHED')),
  "gradingMode" TEXT NOT NULL DEFAULT 'GRADED' CHECK ("gradingMode" IN ('GRADED','PRACTICE','UNGRADED')), "availableFrom" TIMESTAMPTZ, "availableUntil" TIMESTAMPTZ,
  "showProgressBar" BOOLEAN NOT NULL DEFAULT TRUE, "branchingEnabled" BOOLEAN NOT NULL DEFAULT FALSE, "totalPoints" DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK ("totalPoints" >= 0),
  "passingScore" DOUBLE PRECISION CHECK ("passingScore" IS NULL OR "passingScore" >= 0), "requireVideoWatch" BOOLEAN NOT NULL DEFAULT FALSE,
  "videoWatchPct" INTEGER NOT NULL DEFAULT 90 CHECK ("videoWatchPct" BETWEEN 0 AND 100), "maxAttempts" INTEGER NOT NULL DEFAULT 0 CHECK ("maxAttempts" >= 0),
  "publishedAt" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("availableUntil" IS NULL OR "availableFrom" IS NULL OR "availableUntil" >= "availableFrom")
);
