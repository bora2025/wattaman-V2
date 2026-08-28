CREATE TYPE "AdvisoryAction" AS ENUM ('WARN', 'DISABLE', 'REMOVE');

ALTER TABLE "SecurityAdvisory"
  ADD COLUMN "recommendedAction" "AdvisoryAction" NOT NULL DEFAULT 'WARN',
  ADD COLUMN "communicationUrl" TEXT;
