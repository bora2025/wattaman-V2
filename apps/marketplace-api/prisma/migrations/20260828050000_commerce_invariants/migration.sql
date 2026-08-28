-- This migration assumes no commerce orders or entitlements have been fulfilled yet.
-- Paid publication remains disabled in the baseline release, so failing on existing rows is intentional.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "MarketplaceOrder" LIMIT 1)
     OR EXISTS (SELECT 1 FROM "MarketplaceOrderLine" LIMIT 1)
     OR EXISTS (SELECT 1 FROM "InstallationEntitlement" LIMIT 1) THEN
    RAISE EXCEPTION 'commerce invariant migration requires empty order and entitlement tables';
  END IF;
END $$;

CREATE TABLE "ProductPrice" (
    "id" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "licensedMajor" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "updatesDays" INTEGER NOT NULL DEFAULT 365,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductPrice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductPrice_amountMinor_check" CHECK ("amountMinor" >= 0),
    CONSTRAINT "ProductPrice_licensedMajor_check" CHECK ("licensedMajor" >= 0),
    CONSTRAINT "ProductPrice_updatesDays_check" CHECK ("updatesDays" BETWEEN 0 AND 3650),
    CONSTRAINT "ProductPrice_validity_check" CHECK ("validUntil" IS NULL OR "validUntil" > "validFrom")
);

ALTER TABLE "MarketplaceOrder" ADD COLUMN "installationId" TEXT NOT NULL;
ALTER TABLE "MarketplaceOrderLine" ADD COLUMN "priceId" TEXT NOT NULL;
ALTER TABLE "InstallationEntitlement" ADD COLUMN "signedToken" JSONB NOT NULL;

CREATE INDEX "ProductPrice_pluginId_currency_validFrom_idx" ON "ProductPrice"("pluginId", "currency", "validFrom");
CREATE INDEX "MarketplaceOrder_installationId_createdAt_idx" ON "MarketplaceOrder"("installationId", "createdAt");

ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "MarketplacePlugin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "InstallationRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceOrderLine" ADD CONSTRAINT "MarketplaceOrderLine_priceId_fkey" FOREIGN KEY ("priceId") REFERENCES "ProductPrice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
