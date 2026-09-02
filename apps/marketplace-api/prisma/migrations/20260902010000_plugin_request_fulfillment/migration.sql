ALTER TYPE "SchoolPluginRequestDecisionType" ADD VALUE 'ORDER_CREATED';

ALTER TABLE "SchoolPluginRequest"
  ADD COLUMN "orderId" UUID,
  ADD COLUMN "entitlementId" UUID;

CREATE UNIQUE INDEX "SchoolPluginRequest_orderId_key" ON "SchoolPluginRequest"("orderId");
CREATE UNIQUE INDEX "SchoolPluginRequest_entitlementId_key" ON "SchoolPluginRequest"("entitlementId");

ALTER TABLE "SchoolPluginRequest" ADD CONSTRAINT "SchoolPluginRequest_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "MarketplaceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolPluginRequest" ADD CONSTRAINT "SchoolPluginRequest_entitlementId_fkey"
  FOREIGN KEY ("entitlementId") REFERENCES "InstallationEntitlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
