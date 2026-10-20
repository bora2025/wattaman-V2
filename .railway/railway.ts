import { bucket, defineRailway, postgres, project, ref, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "asia-southeast1-eqsg3a" });
  Postgres.networking = { privateNetworkEndpoint: "postgres" };
  const marketplaceApiVolume = volume("marketplace-api-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "asia-southeast1-eqsg3a", sizeMB: 50000 });
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "asia-southeast1-eqsg3a", sizeMB: 50000 });
  const marketplaceArtifacts = bucket("marketplace-artifacts", { region: "sin" });
  const platformAdminWeb = service("platform-admin-web", {
    build: { buildEnvironment: "V3", builder: "RAILPACK" },
    replicas: { "asia-southeast1-eqsg3a": 1 },
  });
  const marketplaceApi = service("marketplace-api", {
    build: { buildEnvironment: "V3", builder: "RAILPACK" },
    replicas: { "asia-southeast1-eqsg3a": 1 },
    volumeMounts: { "/data": marketplaceApiVolume },
    env: {
      ARTIFACT_S3_ACCESS_KEY_ID: ref(marketplaceArtifacts, "ACCESS_KEY_ID"),
      ARTIFACT_S3_BUCKET: ref(marketplaceArtifacts, "BUCKET"),
      ARTIFACT_S3_ENDPOINT: ref(marketplaceArtifacts, "ENDPOINT"),
      ARTIFACT_S3_FORCE_PATH_STYLE: "false",
      ARTIFACT_S3_REGION: ref(marketplaceArtifacts, "REGION"),
      ARTIFACT_S3_SECRET_ACCESS_KEY: ref(marketplaceArtifacts, "SECRET_ACCESS_KEY"),
      ARTIFACT_STORAGE_PROVIDER: "local",
    },
  });

  return project("marketplace", {
    variables: { managed: false },
    resources: [Postgres, platformAdminWeb, marketplaceApi, marketplaceArtifacts, marketplaceApiVolume, postgresVolume],
  });
});
