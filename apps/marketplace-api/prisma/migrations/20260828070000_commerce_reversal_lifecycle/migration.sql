-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'WON', 'LOST');

-- AlterTable
ALTER TABLE "InstallationEntitlement"
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "revokedReason" TEXT;

-- CreateIndex
CREATE INDEX "InstallationEntitlement_status_expiresAt_idx" ON "InstallationEntitlement"("status", "expiresAt");

-- CreateTable
CREATE TABLE "MarketplaceRefund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "initiatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceRefund_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MarketplaceRefund_amountMinor_check" CHECK ("amountMinor" >= 0)
);

-- CreateTable
CREATE TABLE "MarketplacePaymentDispute" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "providerDisputeRef" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "MarketplacePaymentDispute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceRefund_paymentId_key" ON "MarketplaceRefund"("paymentId");

-- CreateIndex
CREATE INDEX "MarketplaceRefund_orderId_idx" ON "MarketplaceRefund"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplacePaymentDispute_paymentId_providerDisputeRef_key" ON "MarketplacePaymentDispute"("paymentId", "providerDisputeRef");

-- AddForeignKey
ALTER TABLE "MarketplaceRefund" ADD CONSTRAINT "MarketplaceRefund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MarketplaceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceRefund" ADD CONSTRAINT "MarketplaceRefund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "MarketplacePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplacePaymentDispute" ADD CONSTRAINT "MarketplacePaymentDispute_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "MarketplacePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
