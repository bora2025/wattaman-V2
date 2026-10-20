import { defineRailway, postgres, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "asia-southeast1-eqsg3a" });
  Postgres.networking = { privateNetworkEndpoint: "postgres" };
  const marketplaceApiVolume = volume("marketplace-api-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "asia-southeast1-eqsg3a", sizeMB: 50000 });
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "asia-southeast1-eqsg3a", sizeMB: 50000 });
  const platformAdminWeb = service("platform-admin-web", {
    build: { buildEnvironment: "V3", builder: "RAILPACK" },
    replicas: { "asia-southeast1-eqsg3a": 1 },
  });
  const marketplaceApi = service("marketplace-api", {
    build: { buildEnvironment: "V3", builder: "RAILPACK" },
    replicas: { "asia-southeast1-eqsg3a": 1 },
    volumeMounts: { "/data": marketplaceApiVolume },
  });

  return project("marketplace", {
    variables: { managed: false },
    resources: [Postgres, platformAdminWeb, marketplaceApi, marketplaceApiVolume, postgresVolume],
  });
});
