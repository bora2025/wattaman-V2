CREATE TYPE "MarketplaceAccountRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "MarketplaceAccountRequest" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "passwordHash" TEXT,
  "schoolName" TEXT,
  "status" "MarketplaceAccountRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedByOperatorId" TEXT,
  "reviewReason" TEXT,
  "createdAccountId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "MarketplaceAccountRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketplaceAccountRequest_createdAccountId_key" ON "MarketplaceAccountRequest"("createdAccountId");
CREATE INDEX "MarketplaceAccountRequest_status_createdAt_idx" ON "MarketplaceAccountRequest"("status", "createdAt");
CREATE INDEX "MarketplaceAccountRequest_email_status_idx" ON "MarketplaceAccountRequest"("email", "status");

ALTER TABLE "MarketplaceAccountRequest" ADD CONSTRAINT "MarketplaceAccountRequest_reviewedByOperatorId_fkey"
  FOREIGN KEY ("reviewedByOperatorId") REFERENCES "PlatformOperator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceAccountRequest" ADD CONSTRAINT "MarketplaceAccountRequest_createdAccountId_fkey"
  FOREIGN KEY ("createdAccountId") REFERENCES "MarketplaceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
