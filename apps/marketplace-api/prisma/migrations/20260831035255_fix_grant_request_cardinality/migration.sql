-- DropIndex
DROP INDEX "InstallationMarketplaceGrantRequest_grantId_key";

-- CreateIndex
CREATE INDEX "InstallationMarketplaceGrantRequest_grantId_idx" ON "InstallationMarketplaceGrantRequest"("grantId");
