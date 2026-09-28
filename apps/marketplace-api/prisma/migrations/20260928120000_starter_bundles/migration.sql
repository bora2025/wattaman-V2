CREATE TABLE "StarterBundle" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StarterBundle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StarterBundleItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bundleId" UUID NOT NULL,
    "pluginId" TEXT NOT NULL,
    "versionRange" TEXT NOT NULL DEFAULT '*',
    "position" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "StarterBundleItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StarterBundle_slug_key" ON "StarterBundle"("slug");
CREATE INDEX "StarterBundle_status_name_idx" ON "StarterBundle"("status", "name");
CREATE UNIQUE INDEX "StarterBundleItem_bundleId_pluginId_key" ON "StarterBundleItem"("bundleId", "pluginId");
CREATE INDEX "StarterBundleItem_pluginId_idx" ON "StarterBundleItem"("pluginId");

ALTER TABLE "StarterBundleItem"
ADD CONSTRAINT "StarterBundleItem_bundleId_fkey"
FOREIGN KEY ("bundleId") REFERENCES "StarterBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StarterBundleItem"
ADD CONSTRAINT "StarterBundleItem_pluginId_fkey"
FOREIGN KEY ("pluginId") REFERENCES "MarketplacePlugin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
