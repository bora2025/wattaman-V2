CREATE TYPE "SchoolProvisioningStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PROVISIONING', 'READY', 'FAILED_RETRYABLE', 'CANCELLED');
CREATE TYPE "SchoolProvisioningAttemptStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

CREATE TABLE "SchoolProvisioningRequest" (
  "id" TEXT NOT NULL,
  "customerSchoolId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
  "status" "SchoolProvisioningStatus" NOT NULL DEFAULT 'DRAFT',
  "targetWorkspaceId" TEXT NOT NULL,
  "environment" TEXT NOT NULL DEFAULT 'production',
  "region" TEXT,
  "releaseVersion" TEXT NOT NULL,
  "apiImage" TEXT NOT NULL,
  "webImage" TEXT NOT NULL,
  "gatewayImage" TEXT NOT NULL,
  "requestedDomain" TEXT,
  "requestedByOperatorId" TEXT NOT NULL,
  "approvedByOperatorId" TEXT,
  "internalReason" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "approvalExpiresAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastSuccessfulCheckpoint" TEXT,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchoolProvisioningRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SchoolProvisioningAttempt" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "status" "SchoolProvisioningAttemptStatus" NOT NULL DEFAULT 'RUNNING',
  "workerId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolProvisioningAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchoolProvisioningRequest_idempotencyKey_key" ON "SchoolProvisioningRequest"("idempotencyKey");
CREATE INDEX "SchoolProvisioningRequest_status_createdAt_idx" ON "SchoolProvisioningRequest"("status", "createdAt");
CREATE INDEX "SchoolProvisioningRequest_customerSchoolId_createdAt_idx" ON "SchoolProvisioningRequest"("customerSchoolId", "createdAt");
CREATE UNIQUE INDEX "SchoolProvisioningAttempt_requestId_attemptNumber_key" ON "SchoolProvisioningAttempt"("requestId", "attemptNumber");
CREATE INDEX "SchoolProvisioningAttempt_status_createdAt_idx" ON "SchoolProvisioningAttempt"("status", "createdAt");

ALTER TABLE "SchoolProvisioningRequest" ADD CONSTRAINT "SchoolProvisioningRequest_customerSchoolId_fkey" FOREIGN KEY ("customerSchoolId") REFERENCES "CustomerSchool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolProvisioningRequest" ADD CONSTRAINT "SchoolProvisioningRequest_requestedByOperatorId_fkey" FOREIGN KEY ("requestedByOperatorId") REFERENCES "PlatformOperator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolProvisioningRequest" ADD CONSTRAINT "SchoolProvisioningRequest_approvedByOperatorId_fkey" FOREIGN KEY ("approvedByOperatorId") REFERENCES "PlatformOperator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolProvisioningAttempt" ADD CONSTRAINT "SchoolProvisioningAttempt_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SchoolProvisioningRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
