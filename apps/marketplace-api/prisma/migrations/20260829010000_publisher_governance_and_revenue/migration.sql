CREATE TYPE "PublisherRole" AS ENUM ('OWNER', 'ADMIN', 'RELEASE_MANAGER', 'FINANCE', 'SUPPORT', 'REVIEWER');
CREATE TYPE "SubmissionStatus" AS ENUM ('ANALYZING', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE "ReviewDecisionType" AS ENUM ('APPROVE', 'REJECT');
CREATE TYPE "RevenueEntryType" AS ENUM ('SALE', 'REFUND', 'WITHHOLDING', 'CORRECTION', 'PAYOUT');
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'PAID', 'REJECTED');

ALTER TABLE "PublisherKey" ADD COLUMN "enrolledBy" TEXT, ADD COLUMN "approvedBy" TEXT,
  ADD COLUMN "revokedBy" TEXT, ADD COLUMN "approvedAt" TIMESTAMP(3);

CREATE TABLE "PublisherMember" (
  "id" TEXT PRIMARY KEY, "publisherId" TEXT NOT NULL, "accountId" TEXT NOT NULL,
  "role" "PublisherRole" NOT NULL, "verifiedAt" TIMESTAMP(3), "suspendedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "PublisherPolicy" (
  "id" TEXT PRIMARY KEY, "policyKey" TEXT NOT NULL, "version" TEXT NOT NULL, "title" TEXT NOT NULL,
  "bodySha256" TEXT NOT NULL, "effectiveAt" TIMESTAMP(3) NOT NULL, "retiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "PublisherPolicyAcceptance" (
  "id" TEXT PRIMARY KEY, "policyId" TEXT NOT NULL, "publisherId" TEXT NOT NULL, "accountId" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "ip" TEXT, "userAgent" TEXT
);
CREATE TABLE "PluginSubmission" (
  "id" TEXT PRIMARY KEY, "publisherId" TEXT NOT NULL, "pluginVersionId" TEXT NOT NULL,
  "status" "SubmissionStatus" NOT NULL DEFAULT 'ANALYZING', "analysisReport" JSONB NOT NULL,
  "riskLevel" TEXT NOT NULL, "submittedBy" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "decidedAt" TIMESTAMP(3)
);
CREATE TABLE "SubmissionReview" (
  "id" TEXT PRIMARY KEY, "submissionId" TEXT NOT NULL, "reviewerId" TEXT NOT NULL,
  "decision" "ReviewDecisionType" NOT NULL, "notes" TEXT NOT NULL, "evidence" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "PublisherRevenueEntry" (
  "id" TEXT PRIMARY KEY, "publisherId" TEXT NOT NULL, "orderLineId" TEXT, "refundId" TEXT,
  "type" "RevenueEntryType" NOT NULL, "currency" TEXT NOT NULL, "grossMinor" INTEGER NOT NULL,
  "feeMinor" INTEGER NOT NULL, "taxMinor" INTEGER NOT NULL, "netMinor" INTEGER NOT NULL,
  "description" TEXT NOT NULL, "correctionOfId" TEXT, "createdBy" TEXT NOT NULL, "approvedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "approvedAt" TIMESTAMP(3)
);
CREATE TABLE "PublisherStatement" (
  "id" TEXT PRIMARY KEY, "publisherId" TEXT NOT NULL, "currency" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL, "periodEnd" TIMESTAMP(3) NOT NULL,
  "grossMinor" INTEGER NOT NULL, "feeMinor" INTEGER NOT NULL, "taxMinor" INTEGER NOT NULL,
  "netMinor" INTEGER NOT NULL, "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "PublisherStatementLine" (
  "statementId" TEXT NOT NULL, "entryId" TEXT NOT NULL, PRIMARY KEY ("statementId", "entryId")
);
CREATE TABLE "PublisherPayout" (
  "id" TEXT PRIMARY KEY, "publisherId" TEXT NOT NULL, "currency" TEXT NOT NULL, "amountMinor" INTEGER NOT NULL,
  "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING_APPROVAL', "providerReference" TEXT,
  "requestedBy" TEXT NOT NULL, "approvedBy" TEXT, "paidBy" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "approvedAt" TIMESTAMP(3), "paidAt" TIMESTAMP(3)
);
CREATE TABLE "PublisherPayoutLine" (
  "payoutId" TEXT NOT NULL, "entryId" TEXT NOT NULL, PRIMARY KEY ("payoutId", "entryId")
);

CREATE UNIQUE INDEX "PublisherMember_publisherId_accountId_role_key" ON "PublisherMember"("publisherId", "accountId", "role");
CREATE INDEX "PublisherMember_accountId_suspendedAt_idx" ON "PublisherMember"("accountId", "suspendedAt");
CREATE UNIQUE INDEX "PublisherPolicy_policyKey_version_key" ON "PublisherPolicy"("policyKey", "version");
CREATE INDEX "PublisherPolicy_policyKey_effectiveAt_idx" ON "PublisherPolicy"("policyKey", "effectiveAt");
CREATE UNIQUE INDEX "PublisherPolicyAcceptance_policyId_publisherId_accountId_key" ON "PublisherPolicyAcceptance"("policyId", "publisherId", "accountId");
CREATE INDEX "PublisherPolicyAcceptance_publisherId_acceptedAt_idx" ON "PublisherPolicyAcceptance"("publisherId", "acceptedAt");
CREATE UNIQUE INDEX "PluginSubmission_pluginVersionId_key" ON "PluginSubmission"("pluginVersionId");
CREATE INDEX "PluginSubmission_status_submittedAt_idx" ON "PluginSubmission"("status", "submittedAt");
CREATE INDEX "PluginSubmission_publisherId_submittedAt_idx" ON "PluginSubmission"("publisherId", "submittedAt");
CREATE UNIQUE INDEX "SubmissionReview_submissionId_reviewerId_key" ON "SubmissionReview"("submissionId", "reviewerId");
CREATE INDEX "SubmissionReview_submissionId_decision_idx" ON "SubmissionReview"("submissionId", "decision");
CREATE UNIQUE INDEX "PublisherRevenueEntry_orderLineId_type_key" ON "PublisherRevenueEntry"("orderLineId", "type");
CREATE INDEX "PublisherRevenueEntry_publisherId_currency_createdAt_idx" ON "PublisherRevenueEntry"("publisherId", "currency", "createdAt");
CREATE INDEX "PublisherRevenueEntry_orderLineId_type_idx" ON "PublisherRevenueEntry"("orderLineId", "type");
CREATE UNIQUE INDEX "PublisherStatement_publisherId_currency_periodStart_periodEnd_key" ON "PublisherStatement"("publisherId", "currency", "periodStart", "periodEnd");
CREATE UNIQUE INDEX "PublisherStatementLine_entryId_key" ON "PublisherStatementLine"("entryId");
CREATE INDEX "PublisherPayout_publisherId_status_requestedAt_idx" ON "PublisherPayout"("publisherId", "status", "requestedAt");
CREATE UNIQUE INDEX "PublisherPayoutLine_entryId_key" ON "PublisherPayoutLine"("entryId");

ALTER TABLE "PublisherMember" ADD CONSTRAINT "PublisherMember_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublisherMember" ADD CONSTRAINT "PublisherMember_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MarketplaceAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublisherPolicyAcceptance" ADD CONSTRAINT "PublisherPolicyAcceptance_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "PublisherPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublisherPolicyAcceptance" ADD CONSTRAINT "PublisherPolicyAcceptance_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublisherPolicyAcceptance" ADD CONSTRAINT "PublisherPolicyAcceptance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MarketplaceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PluginSubmission" ADD CONSTRAINT "PluginSubmission_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PluginSubmission" ADD CONSTRAINT "PluginSubmission_pluginVersionId_fkey" FOREIGN KEY ("pluginVersionId") REFERENCES "PluginVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubmissionReview" ADD CONSTRAINT "SubmissionReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "PluginSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubmissionReview" ADD CONSTRAINT "SubmissionReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "MarketplaceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublisherRevenueEntry" ADD CONSTRAINT "PublisherRevenueEntry_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublisherRevenueEntry" ADD CONSTRAINT "PublisherRevenueEntry_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "MarketplaceOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublisherRevenueEntry" ADD CONSTRAINT "PublisherRevenueEntry_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "MarketplaceRefund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublisherRevenueEntry" ADD CONSTRAINT "PublisherRevenueEntry_correctionOfId_fkey" FOREIGN KEY ("correctionOfId") REFERENCES "PublisherRevenueEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublisherStatement" ADD CONSTRAINT "PublisherStatement_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublisherStatementLine" ADD CONSTRAINT "PublisherStatementLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "PublisherStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublisherStatementLine" ADD CONSTRAINT "PublisherStatementLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "PublisherRevenueEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublisherPayout" ADD CONSTRAINT "PublisherPayout_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublisherPayoutLine" ADD CONSTRAINT "PublisherPayoutLine_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "PublisherPayout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublisherPayoutLine" ADD CONSTRAINT "PublisherPayoutLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "PublisherRevenueEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
