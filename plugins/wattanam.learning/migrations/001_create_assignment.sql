-- wattanam-plugin-migration: 001_create_assignment
CREATE TABLE plugin_wattanam_learning_assignment (
  "id" TEXT PRIMARY KEY, "title" TEXT NOT NULL, "description" TEXT, "instructions" TEXT,
  "academicClassId" TEXT NOT NULL, "createdByDirectoryUserId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'HOMEWORK' CHECK ("type" IN ('HOMEWORK','QUIZ','PROJECT','LAB','ESSAY')),
  "weight" DOUBLE PRECISION NOT NULL DEFAULT 1 CHECK ("weight" >= 0), "availableFrom" TIMESTAMPTZ, "dueDate" TIMESTAMPTZ,
  "totalMarks" DOUBLE PRECISION NOT NULL DEFAULT 100 CHECK ("totalMarks" >= 0), "allowLate" BOOLEAN NOT NULL DEFAULT TRUE,
  "latePenaltyPct" DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK ("latePenaltyPct" BETWEEN 0 AND 100), "maxAttempts" INTEGER NOT NULL DEFAULT 1 CHECK ("maxAttempts" >= 0),
  "status" TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK ("status" IN ('DRAFT','PUBLISHED','CLOSED')), "attachmentUrl" TEXT, "publishedAt" TIMESTAMPTZ,
  "randomizeQuestions" BOOLEAN NOT NULL DEFAULT FALSE, "randomizeChoices" BOOLEAN NOT NULL DEFAULT FALSE, "timeLimitMinutes" INTEGER CHECK ("timeLimitMinutes" IS NULL OR "timeLimitMinutes" > 0),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("dueDate" IS NULL OR "availableFrom" IS NULL OR "dueDate" >= "availableFrom")
);
