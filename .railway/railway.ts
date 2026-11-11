import { bucket, defineRailway, image, postgres, project, service, volume } from "railway/iac";

function marketplaceReleaseImage(): ReturnType<typeof image> {
  const value = process.env.MARKETPLACE_API_IMAGE?.trim();
  if (!value || !/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error("MARKETPLACE_API_IMAGE must be a digest-pinned GHCR release image");
  }
  return image(value);
}

function platformAdminReleaseImage(): ReturnType<typeof image> {
  const value = process.env.PLATFORM_ADMIN_IMAGE?.trim();
  if (!value || !/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error("PLATFORM_ADMIN_IMAGE must be a digest-pinned GHCR release image");
  }
  return image(value);
}

export default defineRailway(() => {
  const marketplaceRelease = marketplaceReleaseImage();
  const platformAdminRelease = platformAdminReleaseImage();
  const Postgres = postgres("Postgres", { region: "asia-southeast1-eqsg3a" });
  Postgres.networking = { privateNetworkEndpoint: "postgres" };
  const marketplaceApiVolume = volume("marketplace-api-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "asia-southeast1-eqsg3a", sizeMB: 50000 });
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "asia-southeast1-eqsg3a", sizeMB: 50000 });
  const marketplaceArtifacts = bucket("marketplace-artifacts", { region: "sin" });
  const platformAdminWeb = service("platform-admin-web", {
    source: platformAdminRelease,
    replicas: { "asia-southeast1-eqsg3a": 1 },
  });
  const marketplaceApi = service("marketplace-api", {
    source: marketplaceRelease,
    replicas: { "asia-southeast1-eqsg3a": 2 },
  });
  // Nightly encrypted off-site backup of the marketplace database (scripts/offsite-backup.js). A
  // separate cron service rather than an in-API timer: the API runs 2 replicas and would back up
  // twice. Same signed image as the API; runs once at 02:15 UTC and exits. Its variables
  // (DATABASE_URL reference, MARKETPLACE_BACKUP_*) are set on Railway; this project leaves
  // variables unmanaged.
  const marketplaceBackup = service("marketplace-backup", {
    source: marketplaceRelease,
    startCommand: "node scripts/offsite-backup.js",
    deploy: { cronSchedule: "15 2 * * *", restartPolicyType: "NEVER" },
    replicas: { "asia-southeast1-eqsg3a": 1 },
  });

  return project("marketplace", {
    variables: { managed: false },
    resources: [Postgres, platformAdminWeb, marketplaceApi, marketplaceBackup, marketplaceArtifacts, marketplaceApiVolume, postgresVolume],
  });
});
