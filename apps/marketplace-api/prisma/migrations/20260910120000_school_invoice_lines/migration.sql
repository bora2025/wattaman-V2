-- Invoice lines. A school invoice was a single description and a single amount, so a bill could
-- not show a subscription and a plugin purchase side by side. SchoolInvoice.amountMinor remains
-- the stored total and is now the sum of these lines.
--
-- SchoolInvoice.periodKey closes a double-billing hole: deduplication of plan invoices rested
-- entirely on a client-generated idempotency key, and the console mints a fresh one on every click,
-- so double-clicking billed a school twice for the same month with two independent suspension
-- clocks. NULL for one-off invoices, and cleared when an invoice is voided so the period it covered
-- can be billed again.
--
-- The backfill gives every existing invoice exactly one line reproducing its current description
-- and amount, so no invoice a customer has already received changes value.

-- CreateEnum
CREATE TYPE "SchoolInvoiceLineKind" AS ENUM ('SUBSCRIPTION', 'PLUGIN', 'ADJUSTMENT', 'CREDIT');

-- AlterTable
ALTER TABLE "SchoolInvoice" ADD COLUMN     "periodKey" TEXT;

-- CreateTable
CREATE TABLE "SchoolInvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "SchoolInvoiceLineKind" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitAmountMinor" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "billingPlanId" TEXT,
    "sourceOrderLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "SchoolInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchoolInvoiceLine_sourceOrderLineId_key" ON "SchoolInvoiceLine"("sourceOrderLineId");

-- CreateIndex
CREATE INDEX "SchoolInvoiceLine_invoiceId_idx" ON "SchoolInvoiceLine"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolInvoiceLine_invoiceId_position_key" ON "SchoolInvoiceLine"("invoiceId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolInvoice_customerSchoolId_periodKey_key" ON "SchoolInvoice"("customerSchoolId", "periodKey");

-- AddForeignKey
ALTER TABLE "SchoolInvoiceLine" ADD CONSTRAINT "SchoolInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SchoolInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolInvoiceLine" ADD CONSTRAINT "SchoolInvoiceLine_billingPlanId_fkey" FOREIGN KEY ("billingPlanId") REFERENCES "SchoolBillingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolInvoiceLine" ADD CONSTRAINT "SchoolInvoiceLine_sourceOrderLineId_fkey" FOREIGN KEY ("sourceOrderLineId") REFERENCES "MarketplaceOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: one line per existing invoice, preserving its value exactly.
INSERT INTO "SchoolInvoiceLine" ("id", "invoiceId", "position", "kind", "description", "quantity", "unitAmountMinor", "amountMinor", "taxMinor", "periodStart", "periodEnd", "billingPlanId", "createdAt")
SELECT gen_random_uuid()::text, i."id", 0,
       CASE WHEN i."billingPlanId" IS NOT NULL THEN 'SUBSCRIPTION'::"SchoolInvoiceLineKind" ELSE 'ADJUSTMENT'::"SchoolInvoiceLineKind" END,
       i."description", 1, i."amountMinor", i."amountMinor", 0, i."periodStart", i."periodEnd", i."billingPlanId", i."createdAt"
FROM "SchoolInvoice" i;

-- Adopt existing plan invoices into the period guard. Voided invoices keep a NULL key, which is
-- what lets a voided period be reissued.
UPDATE "SchoolInvoice"
SET "periodKey" = "billingPlanId" || ':' || to_char("periodStart" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
WHERE "billingPlanId" IS NOT NULL AND "periodStart" IS NOT NULL AND "status" <> 'VOID';
