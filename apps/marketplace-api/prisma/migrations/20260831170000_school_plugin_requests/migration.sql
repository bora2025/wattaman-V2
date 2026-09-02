CREATE TYPE "SchoolPluginRequestType" AS ENUM ('FREE_APPROVAL', 'PURCHASE_ASSISTANCE', 'PRIVATE_PLUGIN_ACCESS', 'TRIAL', 'FEATURE_REQUEST');
CREATE TYPE "SchoolPluginRequestStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFORMATION', 'APPROVED', 'REJECTED', 'CANCELLED', 'ENTITLEMENT_ISSUED');
CREATE TYPE "SchoolPluginRequestDecisionType" AS ENUM ('ASSIGNED', 'STARTED_REVIEW', 'INFORMATION_REQUESTED', 'INFORMATION_RECEIVED', 'APPROVED', 'REJECTED', 'CANCELLED', 'ENTITLEMENT_ISSUED');
CREATE TYPE "SchoolPluginRequestMessageVisibility" AS ENUM ('CUSTOMER', 'INTERNAL');

CREATE TABLE "SchoolPluginRequest" (
  "id" TEXT NOT NULL, "accountId" TEXT NOT NULL, "installationId" TEXT NOT NULL,
  "pluginId" TEXT, "type" "SchoolPluginRequestType" NOT NULL,
  "status" "SchoolPluginRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
  "justification" TEXT NOT NULL, "intendedUsers" INTEGER, "desiredAt" TIMESTAMP(3),
  "contactEmail" TEXT NOT NULL, "featureDescription" TEXT, "slaDueAt" TIMESTAMP(3) NOT NULL,
  "assignedOperatorId" TEXT, "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3), "fulfilledAt" TIMESTAMP(3), "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchoolPluginRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SchoolPluginRequestDecision" (
  "id" TEXT NOT NULL, "requestId" TEXT NOT NULL, "operatorId" TEXT NOT NULL,
  "decision" "SchoolPluginRequestDecisionType" NOT NULL, "publicMessage" TEXT,
  "internalReason" TEXT, "conditions" JSONB, "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolPluginRequestDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SchoolPluginRequestMessage" (
  "id" TEXT NOT NULL, "requestId" TEXT NOT NULL,
  "visibility" "SchoolPluginRequestMessageVisibility" NOT NULL, "body" TEXT NOT NULL,
  "accountAuthorId" TEXT, "operatorAuthorId" TEXT, "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolPluginRequestMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SchoolPluginRequestMessage_exactly_one_author" CHECK (
    (("accountAuthorId" IS NOT NULL)::int + ("operatorAuthorId" IS NOT NULL)::int) = 1
  )
);

CREATE UNIQUE INDEX "SchoolPluginRequestDecision_idempotencyKey_key" ON "SchoolPluginRequestDecision"("idempotencyKey");
CREATE UNIQUE INDEX "SchoolPluginRequestMessage_idempotencyKey_key" ON "SchoolPluginRequestMessage"("idempotencyKey");
CREATE INDEX "SchoolPluginRequest_status_slaDueAt_idx" ON "SchoolPluginRequest"("status", "slaDueAt");
CREATE INDEX "SchoolPluginRequest_accountId_submittedAt_idx" ON "SchoolPluginRequest"("accountId", "submittedAt");
CREATE INDEX "SchoolPluginRequest_installationId_pluginId_type_idx" ON "SchoolPluginRequest"("installationId", "pluginId", "type");
CREATE INDEX "SchoolPluginRequest_assignedOperatorId_status_idx" ON "SchoolPluginRequest"("assignedOperatorId", "status");
CREATE INDEX "SchoolPluginRequestDecision_requestId_createdAt_idx" ON "SchoolPluginRequestDecision"("requestId", "createdAt");
CREATE INDEX "SchoolPluginRequestDecision_operatorId_createdAt_idx" ON "SchoolPluginRequestDecision"("operatorId", "createdAt");
CREATE INDEX "SchoolPluginRequestMessage_requestId_createdAt_idx" ON "SchoolPluginRequestMessage"("requestId", "createdAt");

ALTER TABLE "SchoolPluginRequest" ADD CONSTRAINT "SchoolPluginRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MarketplaceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolPluginRequest" ADD CONSTRAINT "SchoolPluginRequest_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "InstallationRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolPluginRequest" ADD CONSTRAINT "SchoolPluginRequest_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "MarketplacePlugin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolPluginRequest" ADD CONSTRAINT "SchoolPluginRequest_assignedOperatorId_fkey" FOREIGN KEY ("assignedOperatorId") REFERENCES "PlatformOperator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchoolPluginRequestDecision" ADD CONSTRAINT "SchoolPluginRequestDecision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SchoolPluginRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolPluginRequestDecision" ADD CONSTRAINT "SchoolPluginRequestDecision_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "PlatformOperator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolPluginRequestMessage" ADD CONSTRAINT "SchoolPluginRequestMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SchoolPluginRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolPluginRequestMessage" ADD CONSTRAINT "SchoolPluginRequestMessage_accountAuthorId_fkey" FOREIGN KEY ("accountAuthorId") REFERENCES "MarketplaceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolPluginRequestMessage" ADD CONSTRAINT "SchoolPluginRequestMessage_operatorAuthorId_fkey" FOREIGN KEY ("operatorAuthorId") REFERENCES "PlatformOperator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
