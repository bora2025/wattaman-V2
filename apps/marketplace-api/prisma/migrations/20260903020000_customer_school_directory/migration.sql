-- CreateEnum
CREATE TYPE "SchoolLifecycleStatus" AS ENUM ('PROSPECT', 'AWAITING_CLAIM', 'ACTIVE', 'SUSPENDED', 'TERMINATED');

-- AlterTable
ALTER TABLE "InstallationRegistration" ADD COLUMN     "customerSchoolId" TEXT;

-- CreateTable
CREATE TABLE "CustomerSchool" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "SchoolLifecycleStatus" NOT NULL DEFAULT 'PROSPECT',
    "region" TEXT,
    "timezone" TEXT,
    "locale" TEXT,
    "currency" TEXT,
    "plan" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "railwayProjectId" TEXT,
    "gatewayOrigin" TEXT,
    "notes" TEXT,
    "createdByOperatorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "suspendedAt" TIMESTAMP(3),
    "suspendedReason" TEXT,
    "terminatedAt" TIMESTAMP(3),
    "terminatedReason" TEXT,

    CONSTRAINT "CustomerSchool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolEnrollmentToken" (
    "id" TEXT NOT NULL,
    "customerSchoolId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdByOperatorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "consumedByInstallationId" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "SchoolEnrollmentToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSchool_slug_key" ON "CustomerSchool"("slug");

-- CreateIndex
CREATE INDEX "CustomerSchool_status_createdAt_idx" ON "CustomerSchool"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolEnrollmentToken_tokenHash_key" ON "SchoolEnrollmentToken"("tokenHash");

-- CreateIndex
CREATE INDEX "SchoolEnrollmentToken_customerSchoolId_consumedAt_expiresAt_idx" ON "SchoolEnrollmentToken"("customerSchoolId", "consumedAt", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "InstallationRegistration_customerSchoolId_key" ON "InstallationRegistration"("customerSchoolId");

-- AddForeignKey
ALTER TABLE "CustomerSchool" ADD CONSTRAINT "CustomerSchool_createdByOperatorId_fkey" FOREIGN KEY ("createdByOperatorId") REFERENCES "PlatformOperator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolEnrollmentToken" ADD CONSTRAINT "SchoolEnrollmentToken_customerSchoolId_fkey" FOREIGN KEY ("customerSchoolId") REFERENCES "CustomerSchool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolEnrollmentToken" ADD CONSTRAINT "SchoolEnrollmentToken_createdByOperatorId_fkey" FOREIGN KEY ("createdByOperatorId") REFERENCES "PlatformOperator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationRegistration" ADD CONSTRAINT "InstallationRegistration_customerSchoolId_fkey" FOREIGN KEY ("customerSchoolId") REFERENCES "CustomerSchool"("id") ON DELETE SET NULL ON UPDATE CASCADE;
