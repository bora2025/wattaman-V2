CREATE TYPE "SchoolInvoiceStatus" AS ENUM ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID');

CREATE TABLE "SchoolInvoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "customerSchoolId" TEXT NOT NULL,
    "status" "SchoolInvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "currency" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "paidMinor" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdByOperatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SchoolInvoice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SchoolInvoice_amount_positive" CHECK ("amountMinor" > 0),
    CONSTRAINT "SchoolInvoice_paid_valid" CHECK ("paidMinor" >= 0 AND "paidMinor" <= "amountMinor")
);

CREATE TABLE "SchoolPayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerReference" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "recordedByOperatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchoolPayment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SchoolPayment_amount_positive" CHECK ("amountMinor" > 0)
);

CREATE UNIQUE INDEX "SchoolInvoice_invoiceNumber_key" ON "SchoolInvoice"("invoiceNumber");
CREATE UNIQUE INDEX "SchoolInvoice_idempotencyKey_key" ON "SchoolInvoice"("idempotencyKey");
CREATE INDEX "SchoolInvoice_customerSchoolId_issuedAt_idx" ON "SchoolInvoice"("customerSchoolId", "issuedAt");
CREATE INDEX "SchoolInvoice_status_dueAt_idx" ON "SchoolInvoice"("status", "dueAt");
CREATE UNIQUE INDEX "SchoolPayment_provider_providerReference_key" ON "SchoolPayment"("provider", "providerReference");
CREATE INDEX "SchoolPayment_invoiceId_receivedAt_idx" ON "SchoolPayment"("invoiceId", "receivedAt");

ALTER TABLE "SchoolInvoice" ADD CONSTRAINT "SchoolInvoice_customerSchoolId_fkey" FOREIGN KEY ("customerSchoolId") REFERENCES "CustomerSchool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolInvoice" ADD CONSTRAINT "SchoolInvoice_createdByOperatorId_fkey" FOREIGN KEY ("createdByOperatorId") REFERENCES "PlatformOperator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolPayment" ADD CONSTRAINT "SchoolPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SchoolInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolPayment" ADD CONSTRAINT "SchoolPayment_recordedByOperatorId_fkey" FOREIGN KEY ("recordedByOperatorId") REFERENCES "PlatformOperator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
