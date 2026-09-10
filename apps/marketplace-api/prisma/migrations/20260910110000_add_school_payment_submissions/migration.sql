CREATE TYPE "SchoolPaymentSubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "SchoolPaymentSubmission" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerReference" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "note" TEXT,
  "status" "SchoolPaymentSubmissionStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedByOperatorId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchoolPaymentSubmission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SchoolPaymentSubmission_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SchoolInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SchoolPaymentSubmission_accountId_provider_providerReference_key" ON "SchoolPaymentSubmission"("accountId", "provider", "providerReference");
CREATE INDEX "SchoolPaymentSubmission_invoiceId_status_createdAt_idx" ON "SchoolPaymentSubmission"("invoiceId", "status", "createdAt");
