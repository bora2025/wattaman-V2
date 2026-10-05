-- One marketplace owner may request access for more than one customer school. The account remains
-- unique by email; this relationship records which existing account each approved request reused.
DROP INDEX IF EXISTS "MarketplaceAccountRequest_createdAccountId_key";
CREATE INDEX "MarketplaceAccountRequest_createdAccountId_idx" ON "MarketplaceAccountRequest"("createdAccountId");
