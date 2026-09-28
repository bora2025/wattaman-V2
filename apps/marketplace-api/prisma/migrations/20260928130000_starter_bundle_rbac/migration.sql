-- Starter bundles are catalog metadata, not plugin releases. Give them a dedicated permission
-- boundary so Marketplace Operators can curate recommendations without receiving signing or
-- plugin-release publication authority. This data migration upgrades existing installations;
-- the TypeScript seed remains the fresh-environment source of truth.
INSERT INTO "PlatformPermission" ("id", "key", "description") VALUES
  (gen_random_uuid()::text, 'starter_bundles.read', 'View curated starter bundles'),
  (gen_random_uuid()::text, 'starter_bundles.manage', 'Create curated starter-bundle drafts'),
  (gen_random_uuid()::text, 'starter_bundles.publish', 'Publish or withdraw curated starter bundles')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "PlatformRolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "PlatformRole" role
JOIN "PlatformPermission" permission ON permission."key" IN (
  'starter_bundles.read', 'starter_bundles.manage', 'starter_bundles.publish'
)
WHERE role."key" = 'marketplace_operator'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "PlatformRolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "PlatformRole" role
JOIN "PlatformPermission" permission ON permission."key" = 'starter_bundles.read'
WHERE role."key" = 'auditor'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
