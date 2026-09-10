-- Manual bank payment: where Wattanam receives money, and which account a customer says they paid.
--
-- SchoolPaymentMethod is a receiving bank account with its bank-issued QR code, shown to customer
-- schools beside open invoices in the same currency. Methods are archived (active = false), never
-- deleted: SchoolPaymentSubmission.paymentMethodId references them with ON DELETE RESTRICT, because a
-- past submission must keep naming the account it was paid into.
--
-- receiptImage holds the customer's transfer receipt. It is evidence for the reviewer only; balances
-- still move solely through an approved submission's ledger payment.

-- AlterTable
ALTER TABLE "SchoolPaymentSubmission" ADD COLUMN     "paymentMethodId" TEXT,
ADD COLUMN     "receiptImage" TEXT;

-- CreateTable
CREATE TABLE "SchoolPaymentMethod" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "qrImage" TEXT,
    "instructions" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "SchoolPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchoolPaymentMethod_active_currency_position_idx" ON "SchoolPaymentMethod"("active", "currency", "position");

-- AddForeignKey
ALTER TABLE "SchoolPaymentSubmission" ADD CONSTRAINT "SchoolPaymentSubmission_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "SchoolPaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
