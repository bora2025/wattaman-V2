CREATE TYPE "MarketplaceEmailDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD');

CREATE TABLE "MarketplaceEmailDelivery" (
    "id" UUID NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "encryptedMessage" TEXT NOT NULL,
    "status" "MarketplaceEmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "claimToken" TEXT,
    "attemptedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketplaceEmailDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketplaceEmailDelivery_deduplicationKey_key" ON "MarketplaceEmailDelivery"("deduplicationKey");
CREATE INDEX "MarketplaceEmailDelivery_status_nextAttemptAt_createdAt_idx" ON "MarketplaceEmailDelivery"("status", "nextAttemptAt", "createdAt");
CREATE INDEX "MarketplaceEmailDelivery_claimToken_idx" ON "MarketplaceEmailDelivery"("claimToken");
