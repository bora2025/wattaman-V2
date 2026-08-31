-- CreateEnum
CREATE TYPE "PlatformOperatorStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "PlatformOperator" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "PlatformOperatorStatus" NOT NULL DEFAULT 'ACTIVE',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformOperator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformRole" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformPermission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "PlatformPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformRolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "PlatformRolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "PlatformOperatorRole" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "grantedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "PlatformOperatorRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformOperatorSession" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "mfaVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedBySessionId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "PlatformOperatorSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformOperatorMfaRecoveryCode" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "PlatformOperatorMfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAuditEvent" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT,
    "action" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "reason" TEXT,
    "correlationId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformOperator_email_key" ON "PlatformOperator"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformRole_key_key" ON "PlatformRole"("key");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformPermission_key_key" ON "PlatformPermission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformOperatorRole_operatorId_roleId_key" ON "PlatformOperatorRole"("operatorId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformOperatorSession_tokenHash_key" ON "PlatformOperatorSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformOperatorSession_replacedBySessionId_key" ON "PlatformOperatorSession"("replacedBySessionId");

-- CreateIndex
CREATE INDEX "PlatformOperatorSession_operatorId_revokedAt_idx" ON "PlatformOperatorSession"("operatorId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformOperatorMfaRecoveryCode_codeHash_key" ON "PlatformOperatorMfaRecoveryCode"("codeHash");

-- CreateIndex
CREATE INDEX "PlatformAuditEvent_operatorId_createdAt_idx" ON "PlatformAuditEvent"("operatorId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformAuditEvent_action_createdAt_idx" ON "PlatformAuditEvent"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "PlatformRolePermission" ADD CONSTRAINT "PlatformRolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "PlatformRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformRolePermission" ADD CONSTRAINT "PlatformRolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "PlatformPermission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformOperatorRole" ADD CONSTRAINT "PlatformOperatorRole_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "PlatformOperator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformOperatorRole" ADD CONSTRAINT "PlatformOperatorRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "PlatformRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformOperatorSession" ADD CONSTRAINT "PlatformOperatorSession_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "PlatformOperator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformOperatorSession" ADD CONSTRAINT "PlatformOperatorSession_replacedBySessionId_fkey" FOREIGN KEY ("replacedBySessionId") REFERENCES "PlatformOperatorSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformOperatorMfaRecoveryCode" ADD CONSTRAINT "PlatformOperatorMfaRecoveryCode_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "PlatformOperator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAuditEvent" ADD CONSTRAINT "PlatformAuditEvent_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "PlatformOperator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
