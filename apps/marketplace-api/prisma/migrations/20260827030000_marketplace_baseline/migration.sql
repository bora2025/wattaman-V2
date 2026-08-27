-- CreateEnum
CREATE TYPE "PublisherStatus" AS ENUM ('PENDING', 'VERIFIED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ReleaseChannel" AS ENUM ('STABLE', 'BETA');

-- CreateEnum
CREATE TYPE "AdvisorySeverity" AS ENUM ('LOW', 'MODERATE', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "EntitlementStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE "Publisher" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "PublisherStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Publisher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublisherKey" (
    "id" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "publicKeyPem" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublisherKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplacePlugin" (
    "id" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "status" "ReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplacePlugin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PluginVersion" (
    "id" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "requiresCore" TEXT NOT NULL,
    "channel" "ReleaseChannel" NOT NULL DEFAULT 'STABLE',
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "manifestJson" JSONB NOT NULL,
    "changelog" TEXT,
    "publishedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PluginVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageArtifact" (
    "id" TEXT NOT NULL,
    "pluginVersionId" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "publisherKeyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackageArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityAdvisory" (
    "id" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" "AdvisorySeverity" NOT NULL,
    "affectedVersions" TEXT NOT NULL,
    "fixedVersion" TEXT,
    "description" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "SecurityAdvisory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallationRegistration" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "label" TEXT,
    "publicKeyPem" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallationRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallationEntitlement" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "status" "EntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
    "updatesThrough" TIMESTAMP(3),
    "offlineUntil" TIMESTAMP(3),
    "tokenId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orderLineId" TEXT,

    CONSTRAINT "InstallationEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DownloadEvent" (
    "id" TEXT NOT NULL,
    "installationId" TEXT,
    "pluginVersionId" TEXT NOT NULL,
    "artifactSha256" TEXT NOT NULL,
    "downloadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DownloadEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceOrder" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "currency" TEXT NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "updatesThrough" TIMESTAMP(3),

    CONSTRAINT "MarketplaceOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplacePayment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amountMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplacePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersionReview" (
    "id" TEXT NOT NULL,
    "pluginVersionId" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'IN_REVIEW',
    "reviewer" TEXT,
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "VersionReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoreRelease" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "channel" "ReleaseChannel" NOT NULL DEFAULT 'STABLE',
    "nodeRange" TEXT NOT NULL,
    "postgresRange" TEXT NOT NULL,
    "apiImage" TEXT NOT NULL,
    "webImage" TEXT NOT NULL,
    "gatewayImage" TEXT NOT NULL,
    "releaseNotes" TEXT NOT NULL,
    "migrationNotes" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "CoreRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Publisher_slug_key" ON "Publisher"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceAccount_email_key" ON "MarketplaceAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PublisherKey_publisherId_keyId_key" ON "PublisherKey"("publisherId", "keyId");

-- CreateIndex
CREATE INDEX "PluginVersion_reviewStatus_channel_publishedAt_idx" ON "PluginVersion"("reviewStatus", "channel", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PluginVersion_pluginId_version_channel_key" ON "PluginVersion"("pluginId", "version", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "PackageArtifact_pluginVersionId_key" ON "PackageArtifact"("pluginVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "PackageArtifact_sha256_key" ON "PackageArtifact"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "PackageArtifact_storageKey_key" ON "PackageArtifact"("storageKey");

-- CreateIndex
CREATE INDEX "SecurityAdvisory_pluginId_publishedAt_idx" ON "SecurityAdvisory"("pluginId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InstallationRegistration_installationId_key" ON "InstallationRegistration"("installationId");

-- CreateIndex
CREATE UNIQUE INDEX "InstallationEntitlement_tokenId_key" ON "InstallationEntitlement"("tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "InstallationEntitlement_orderLineId_key" ON "InstallationEntitlement"("orderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "InstallationEntitlement_installationId_pluginId_key" ON "InstallationEntitlement"("installationId", "pluginId");

-- CreateIndex
CREATE INDEX "DownloadEvent_pluginVersionId_downloadedAt_idx" ON "DownloadEvent"("pluginVersionId", "downloadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceOrder_idempotencyKey_key" ON "MarketplaceOrder"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplacePayment_provider_providerRef_key" ON "MarketplacePayment"("provider", "providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_eventId_key" ON "PaymentWebhookEvent"("provider", "eventId");

-- CreateIndex
CREATE INDEX "VersionReview_status_submittedAt_idx" ON "VersionReview"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "CoreRelease_channel_publishedAt_idx" ON "CoreRelease"("channel", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CoreRelease_version_channel_key" ON "CoreRelease"("version", "channel");

-- AddForeignKey
ALTER TABLE "PublisherKey" ADD CONSTRAINT "PublisherKey_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplacePlugin" ADD CONSTRAINT "MarketplacePlugin_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginVersion" ADD CONSTRAINT "PluginVersion_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "MarketplacePlugin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageArtifact" ADD CONSTRAINT "PackageArtifact_pluginVersionId_fkey" FOREIGN KEY ("pluginVersionId") REFERENCES "PluginVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityAdvisory" ADD CONSTRAINT "SecurityAdvisory_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "MarketplacePlugin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationEntitlement" ADD CONSTRAINT "InstallationEntitlement_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "InstallationRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationEntitlement" ADD CONSTRAINT "InstallationEntitlement_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "MarketplacePlugin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationEntitlement" ADD CONSTRAINT "InstallationEntitlement_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "MarketplaceOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownloadEvent" ADD CONSTRAINT "DownloadEvent_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "InstallationRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownloadEvent" ADD CONSTRAINT "DownloadEvent_pluginVersionId_fkey" FOREIGN KEY ("pluginVersionId") REFERENCES "PluginVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MarketplaceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOrderLine" ADD CONSTRAINT "MarketplaceOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MarketplaceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOrderLine" ADD CONSTRAINT "MarketplaceOrderLine_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "MarketplacePlugin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplacePayment" ADD CONSTRAINT "MarketplacePayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MarketplaceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VersionReview" ADD CONSTRAINT "VersionReview_pluginVersionId_fkey" FOREIGN KEY ("pluginVersionId") REFERENCES "PluginVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
