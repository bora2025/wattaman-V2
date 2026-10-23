import { bucket, defineRailway, image, postgres, preserve, project, service, volume } from "railway/iac";

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
    env: { MARKETPLACE_API_URL: preserve(), NODE_ENV: preserve(), PORT: preserve(), RAILWAY_DOCKERFILE_PATH: preserve() },
  });
  const marketplaceApi = service("marketplace-api", {
    source: marketplaceRelease,
    replicas: { "asia-southeast1-eqsg3a": 2 },
    env: {
      ALLOW_MFA_ONLY_PRODUCTION: preserve(), APP_VERSION: preserve(), ARTIFACT_S3_ACCESS_KEY_ID: preserve(),
      ARTIFACT_S3_BUCKET: preserve(), ARTIFACT_S3_ENDPOINT: preserve(), ARTIFACT_S3_FORCE_PATH_STYLE: preserve(),
      ARTIFACT_S3_REGION: preserve(), ARTIFACT_S3_SECRET_ACCESS_KEY: preserve(), ARTIFACT_STORAGE_PATH: preserve(),
      ARTIFACT_STORAGE_PROVIDER: preserve(), DATABASE_URL: preserve(), ENTITLEMENT_SIGNING_KEY_ID: preserve(),
      ENTITLEMENT_SIGNING_PRIVATE_KEY: preserve(), GIT_COMMIT: preserve(), IDENTITY_ENCRYPTION_ACTIVE_KEY_ID: preserve(),
      IDENTITY_ENCRYPTION_KEYS_JSON: preserve(), MARKETPLACE_ADMIN_TOKEN: preserve(), METADATA_SIGNING_KEY_ID: preserve(),
      METADATA_SIGNING_PRIVATE_KEY: preserve(), NODE_ENV: preserve(), PAYMENT_WEBHOOK_SECRET: preserve(), PORT: preserve(),
      PUBLIC_BASE_URL: preserve(), RAILWAY_DOCKERFILE_PATH: preserve(), TRANSACTIONAL_EMAIL_PROVIDER: preserve(),
    },
  });

  return project("marketplace", {
    variables: { managed: false },
    resources: [Postgres, platformAdminWeb, marketplaceApi, marketplaceArtifacts, marketplaceApiVolume, postgresVolume],
  });
});
