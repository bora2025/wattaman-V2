-- CreateEnum
CREATE TYPE "InstallationLinkStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'DELIVERED');

-- AlterTable
ALTER TABLE "MarketplaceSession" ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'FULL',
ADD COLUMN     "sourceGrantId" TEXT;

-- CreateTable
CREATE TABLE "InstallationMarketplaceGrantRequest" (
    "id" TEXT NOT NULL,
    "installationRegistrationId" TEXT NOT NULL,
    "requestedScope" TEXT NOT NULL,
    "status" "InstallationLinkStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "grantId" TEXT,

    CONSTRAINT "InstallationMarketplaceGrantRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallationMarketplaceGrant" (
    "id" TEXT NOT NULL,
    "installationRegistrationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "InstallationMarketplaceGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstallationMarketplaceGrantRequest_grantId_key" ON "InstallationMarketplaceGrantRequest"("grantId");

-- CreateIndex
CREATE INDEX "InstallationMarketplaceGrantRequest_installationRegistratio_idx" ON "InstallationMarketplaceGrantRequest"("installationRegistrationId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "InstallationMarketplaceGrant_installationRegistrationId_key" ON "InstallationMarketplaceGrant"("installationRegistrationId");

-- CreateIndex
CREATE INDEX "InstallationMarketplaceGrant_accountId_revokedAt_idx" ON "InstallationMarketplaceGrant"("accountId", "revokedAt");

-- CreateIndex
CREATE INDEX "MarketplaceSession_sourceGrantId_revokedAt_idx" ON "MarketplaceSession"("sourceGrantId", "revokedAt");

-- AddForeignKey
ALTER TABLE "InstallationMarketplaceGrantRequest" ADD CONSTRAINT "InstallationMarketplaceGrantRequest_installationRegistrati_fkey" FOREIGN KEY ("installationRegistrationId") REFERENCES "InstallationRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationMarketplaceGrantRequest" ADD CONSTRAINT "InstallationMarketplaceGrantRequest_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "InstallationMarketplaceGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationMarketplaceGrant" ADD CONSTRAINT "InstallationMarketplaceGrant_installationRegistrationId_fkey" FOREIGN KEY ("installationRegistrationId") REFERENCES "InstallationRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationMarketplaceGrant" ADD CONSTRAINT "InstallationMarketplaceGrant_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MarketplaceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
