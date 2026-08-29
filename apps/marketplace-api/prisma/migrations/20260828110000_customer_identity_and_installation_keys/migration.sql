-- This migration assumes no accounts or installations have registered yet.
-- Neither customer identity nor installation key trust has shipped before this release,
-- so failing on existing rows is intentional rather than backfilling fabricated secrets.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "MarketplaceAccount" LIMIT 1)
     OR EXISTS (SELECT 1 FROM "InstallationRegistration" LIMIT 1) THEN
    RAISE EXCEPTION 'customer identity migration requires empty account and installation tables';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "ChallengePurpose" AS ENUM ('REGISTER', 'ROTATE');

-- AlterTable
ALTER TABLE "MarketplaceAccount"
  ADD COLUMN "passwordHash" TEXT NOT NULL,
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mfaSecret" TEXT,
  ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lockedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "InstallationRegistration"
  ADD COLUMN "accountId" TEXT,
  DROP COLUMN "publicKeyPem";

-- CreateTable
CREATE TABLE "MarketplaceSession" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedBySessionId" TEXT,

    CONSTRAINT "MarketplaceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceEmailVerification" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "MarketplaceEmailVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplacePasswordReset" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "MarketplacePasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceMfaRecoveryCode" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "MarketplaceMfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceAuditEvent" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "action" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallationRegistrationKey" (
    "id" TEXT NOT NULL,
    "installationRegistrationId" TEXT NOT NULL,
    "keyFingerprint" TEXT NOT NULL,
    "publicKeyPem" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "InstallationRegistrationKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallationRegistrationChallenge" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "purpose" "ChallengePurpose" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "InstallationRegistrationChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceSession_tokenHash_key" ON "MarketplaceSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceSession_replacedBySessionId_key" ON "MarketplaceSession"("replacedBySessionId");

-- CreateIndex
CREATE INDEX "MarketplaceSession_accountId_revokedAt_idx" ON "MarketplaceSession"("accountId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceEmailVerification_tokenHash_key" ON "MarketplaceEmailVerification"("tokenHash");

-- CreateIndex
CREATE INDEX "MarketplaceEmailVerification_accountId_consumedAt_idx" ON "MarketplaceEmailVerification"("accountId", "consumedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplacePasswordReset_tokenHash_key" ON "MarketplacePasswordReset"("tokenHash");

-- CreateIndex
CREATE INDEX "MarketplacePasswordReset_accountId_consumedAt_idx" ON "MarketplacePasswordReset"("accountId", "consumedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceMfaRecoveryCode_codeHash_key" ON "MarketplaceMfaRecoveryCode"("codeHash");

-- CreateIndex
CREATE INDEX "MarketplaceMfaRecoveryCode_accountId_usedAt_idx" ON "MarketplaceMfaRecoveryCode"("accountId", "usedAt");

-- CreateIndex
CREATE INDEX "MarketplaceAuditEvent_accountId_createdAt_idx" ON "MarketplaceAuditEvent"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceAuditEvent_action_createdAt_idx" ON "MarketplaceAuditEvent"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InstallationRegistrationKey_installationRegistrationId_keyFingerprint_key" ON "InstallationRegistrationKey"("installationRegistrationId", "keyFingerprint");

-- CreateIndex
CREATE INDEX "InstallationRegistrationKey_installationRegistrationId_revokedAt_idx" ON "InstallationRegistrationKey"("installationRegistrationId", "revokedAt");

-- CreateIndex
CREATE INDEX "InstallationRegistrationChallenge_installationId_purpose_consumedAt_expiresAt_idx" ON "InstallationRegistrationChallenge"("installationId", "purpose", "consumedAt", "expiresAt");

-- AddForeignKey
ALTER TABLE "InstallationRegistration" ADD CONSTRAINT "InstallationRegistration_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MarketplaceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceSession" ADD CONSTRAINT "MarketplaceSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MarketplaceAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceSession" ADD CONSTRAINT "MarketplaceSession_replacedBySessionId_fkey" FOREIGN KEY ("replacedBySessionId") REFERENCES "MarketplaceSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceEmailVerification" ADD CONSTRAINT "MarketplaceEmailVerification_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MarketplaceAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplacePasswordReset" ADD CONSTRAINT "MarketplacePasswordReset_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MarketplaceAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceMfaRecoveryCode" ADD CONSTRAINT "MarketplaceMfaRecoveryCode_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MarketplaceAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceAuditEvent" ADD CONSTRAINT "MarketplaceAuditEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MarketplaceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationRegistrationKey" ADD CONSTRAINT "InstallationRegistrationKey_installationRegistrationId_fkey" FOREIGN KEY ("installationRegistrationId") REFERENCES "InstallationRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
