-- Recurring subscription billing.
--
-- CustomerSchool.billingAnchorAt is the instant a subscription renews from. Without it "monthly"
-- meant nothing more precise than "whenever somebody last clicked the button".
--
-- SchoolInvoice.origin plus a nullable createdByOperatorId record that the scheduled run raised an
-- invoice. A null operator alone would be ambiguous with an operator record deleted later, so the
-- origin is stated rather than inferred.
--
-- Deliberately NOT backfilled. Every school with a plan keeps a null anchor until an operator sets
-- one, because starting to raise invoices against a real customer on a guessed anniversary is a
-- money decision made by inference. The console says plainly when a school has no anchor and will
-- therefore not be billed automatically.

-- CreateEnum
CREATE TYPE "SchoolInvoiceOrigin" AS ENUM ('OPERATOR', 'SCHEDULED');

-- AlterTable
ALTER TABLE "CustomerSchool" ADD COLUMN     "billingAnchorAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SchoolInvoice" ADD COLUMN     "origin" "SchoolInvoiceOrigin" NOT NULL DEFAULT 'OPERATOR',
ALTER COLUMN "createdByOperatorId" DROP NOT NULL;
