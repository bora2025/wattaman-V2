-- A marketplace account represents the owner; its school may exist before an installation claims
-- an enrollment token. This relationship makes that pre-claim school navigable from Customers.
ALTER TABLE "CustomerSchool" ADD COLUMN "ownerAccountId" TEXT;

CREATE INDEX "CustomerSchool_ownerAccountId_createdAt_idx"
  ON "CustomerSchool"("ownerAccountId", "createdAt");

ALTER TABLE "CustomerSchool"
  ADD CONSTRAINT "CustomerSchool_ownerAccountId_fkey"
  FOREIGN KEY ("ownerAccountId") REFERENCES "MarketplaceAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
