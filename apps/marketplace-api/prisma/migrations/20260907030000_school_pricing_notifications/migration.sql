CREATE TYPE "SchoolBillingInterval" AS ENUM ('MONTHLY', 'ANNUAL');
CREATE TYPE "SchoolBillingNotificationType" AS ENUM ('INVOICE_ISSUED', 'DUE_SOON', 'OVERDUE', 'PAYMENT_RECEIVED');
CREATE TYPE "SchoolBillingNotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

CREATE TABLE "SchoolBillingPlan" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "billingInterval" "SchoolBillingInterval" NOT NULL,
    "dueDays" INTEGER NOT NULL DEFAULT 14,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SchoolBillingPlan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SchoolBillingPlan_amount_positive" CHECK ("amountMinor" > 0),
    CONSTRAINT "SchoolBillingPlan_due_days_valid" CHECK ("dueDays" BETWEEN 1 AND 90)
);

ALTER TABLE "CustomerSchool" ADD COLUMN "billingPlanId" TEXT;
ALTER TABLE "SchoolInvoice" ADD COLUMN "billingPlanId" TEXT;
ALTER TABLE "SchoolInvoice" ADD COLUMN "billingPlanSlug" TEXT;

CREATE TABLE "SchoolBillingNotification" (
    "id" TEXT NOT NULL,
    "customerSchoolId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "type" "SchoolBillingNotificationType" NOT NULL,
    "status" "SchoolBillingNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "recipientEmail" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "attemptedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchoolBillingNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchoolBillingPlan_slug_key" ON "SchoolBillingPlan"("slug");
CREATE INDEX "SchoolBillingPlan_active_slug_idx" ON "SchoolBillingPlan"("active", "slug");
CREATE UNIQUE INDEX "SchoolBillingNotification_deduplicationKey_key" ON "SchoolBillingNotification"("deduplicationKey");
CREATE INDEX "SchoolBillingNotification_status_createdAt_idx" ON "SchoolBillingNotification"("status", "createdAt");
CREATE INDEX "SchoolBillingNotification_customerSchoolId_createdAt_idx" ON "SchoolBillingNotification"("customerSchoolId", "createdAt");

ALTER TABLE "CustomerSchool" ADD CONSTRAINT "CustomerSchool_billingPlanId_fkey" FOREIGN KEY ("billingPlanId") REFERENCES "SchoolBillingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchoolInvoice" ADD CONSTRAINT "SchoolInvoice_billingPlanId_fkey" FOREIGN KEY ("billingPlanId") REFERENCES "SchoolBillingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchoolBillingNotification" ADD CONSTRAINT "SchoolBillingNotification_customerSchoolId_fkey" FOREIGN KEY ("customerSchoolId") REFERENCES "CustomerSchool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolBillingNotification" ADD CONSTRAINT "SchoolBillingNotification_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SchoolInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
