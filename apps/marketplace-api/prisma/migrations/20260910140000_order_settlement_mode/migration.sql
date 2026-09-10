-- Buying a plugin on the school's invoice.
--
-- IMMEDIATE is the existing behaviour and stays the default, so every order already placed keeps
-- exactly the meaning it had: the entitlement was minted inside the payment transaction.
--
-- INVOICE grants the entitlement when the purchase is approved and bills it on the school's next
-- subscription invoice, which is credit. That reverses the rule that entitlements are never issued
-- before money settles; the reasoning is recorded in
-- docs/decisions/school-invoice-plugin-credit-2026-09-10.md.
--
-- The link between a purchase and the invoice that charged for it is SchoolInvoiceLine
-- .sourceOrderLineId, added with invoice lines and unique -- so one purchase cannot be billed twice
-- even if two billing runs race.

-- CreateEnum
CREATE TYPE "OrderSettlementMode" AS ENUM ('IMMEDIATE', 'INVOICE');

-- AlterTable
ALTER TABLE "MarketplaceOrder" ADD COLUMN     "settlementMode" "OrderSettlementMode" NOT NULL DEFAULT 'IMMEDIATE';
