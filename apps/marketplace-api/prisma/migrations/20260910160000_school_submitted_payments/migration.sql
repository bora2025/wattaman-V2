-- Payment submissions sent by the school's own admin panel.
--
-- A school now reports a payment through its own backend, signed with its installation key, instead
-- of needing a marketplace session. accountId becomes nullable because a school an operator
-- provisioned with an enrollment token may never have a marketplace account.
--
-- source records which door a submission came through; installationRegistrationId and submittedBy
-- tell the reviewer which school sent it and who. The new unique index keeps one transfer reference
-- per invoice across both doors -- the existing account-scoped index cannot see rows whose account
-- is null. Existing data cannot violate it: a portal submission always carried the one account that
-- owns the invoice's school, so the old index already refused duplicates per invoice.

-- CreateEnum
CREATE TYPE "SchoolPaymentSubmissionSource" AS ENUM ('PORTAL', 'SCHOOL');

-- AlterTable
ALTER TABLE "SchoolPaymentSubmission" ADD COLUMN     "installationRegistrationId" TEXT,
ADD COLUMN     "source" "SchoolPaymentSubmissionSource" NOT NULL DEFAULT 'PORTAL',
ADD COLUMN     "submittedBy" TEXT,
ALTER COLUMN "accountId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "SchoolPaymentSubmission_invoiceId_provider_providerReferenc_key" ON "SchoolPaymentSubmission"("invoiceId", "provider", "providerReference");

-- AddForeignKey
ALTER TABLE "SchoolPaymentSubmission" ADD CONSTRAINT "SchoolPaymentSubmission_installationRegistrationId_fkey" FOREIGN KEY ("installationRegistrationId") REFERENCES "InstallationRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
