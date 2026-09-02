CREATE TYPE "SchoolPluginRequestExceptionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "SchoolPluginRequestExceptionApproval" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "requestedByOperatorId" TEXT NOT NULL,
  "decidedByOperatorId" TEXT,
  "status" "SchoolPluginRequestExceptionStatus" NOT NULL DEFAULT 'PENDING',
  "validityDays" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "publicMessage" TEXT,
  "requestIdempotencyKey" TEXT NOT NULL,
  "decisionIdempotencyKey" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  CONSTRAINT "SchoolPluginRequestExceptionApproval_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SchoolPluginRequestExceptionApproval_validityDays_check" CHECK ("validityDays" BETWEEN 1 AND 3650),
  CONSTRAINT "SchoolPluginRequestExceptionApproval_distinct_actors_check" CHECK ("decidedByOperatorId" IS NULL OR "decidedByOperatorId" <> "requestedByOperatorId"),
  CONSTRAINT "SchoolPluginRequestExceptionApproval_decision_state_check" CHECK (
    ("status" = 'PENDING' AND "decidedByOperatorId" IS NULL AND "decidedAt" IS NULL AND "decisionIdempotencyKey" IS NULL)
    OR
    ("status" <> 'PENDING' AND "decidedByOperatorId" IS NOT NULL AND "decidedAt" IS NOT NULL AND "decisionIdempotencyKey" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "SchoolPluginRequestExceptionApproval_requestId_key" ON "SchoolPluginRequestExceptionApproval"("requestId");
CREATE UNIQUE INDEX "SchoolPluginRequestExceptionApproval_requestIdempotencyKey_key" ON "SchoolPluginRequestExceptionApproval"("requestIdempotencyKey");
CREATE UNIQUE INDEX "SchoolPluginRequestExceptionApproval_decisionIdempotencyKey_key" ON "SchoolPluginRequestExceptionApproval"("decisionIdempotencyKey");
CREATE INDEX "SchoolPluginRequestExceptionApproval_status_requestedAt_idx" ON "SchoolPluginRequestExceptionApproval"("status", "requestedAt");
CREATE INDEX "SchoolPluginRequestExceptionApproval_requestedByOperatorId_status_idx" ON "SchoolPluginRequestExceptionApproval"("requestedByOperatorId", "status");

ALTER TABLE "SchoolPluginRequestExceptionApproval" ADD CONSTRAINT "SchoolPluginRequestExceptionApproval_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SchoolPluginRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolPluginRequestExceptionApproval" ADD CONSTRAINT "SchoolPluginRequestExceptionApproval_requestedByOperatorId_fkey" FOREIGN KEY ("requestedByOperatorId") REFERENCES "PlatformOperator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolPluginRequestExceptionApproval" ADD CONSTRAINT "SchoolPluginRequestExceptionApproval_decidedByOperatorId_fkey" FOREIGN KEY ("decidedByOperatorId") REFERENCES "PlatformOperator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
