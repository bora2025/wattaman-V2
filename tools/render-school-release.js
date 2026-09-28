'use strict';

const fs = require('fs');

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`--${name} is required`);
  return process.argv[index + 1];
}

const evidence = JSON.parse(fs.readFileSync(argument('evidence'), 'utf8'));
for (const name of ['api', 'web', 'gateway']) {
  if (!/^.+@sha256:[a-f0-9]{64}$/.test(evidence.images?.[name] || '')) throw new Error(`${name} image is not digest-pinned`);
}

const blueprint = {
  schemaVersion: 1,
  release: { version: evidence.version, commit: evidence.source.commit, evidenceGeneratedAt: evidence.generatedAt },
  invariants: {
    tenancy: 'one-school-per-project',
    publicServices: ['gateway'],
    mutableImageTagsAllowed: false,
    requiredVolumes: ['postgres:/var/lib/postgresql/data', 'api:/data'],
  },
  services: {
    postgres: {
      image: 'ghcr.io/railwayapp-templates/postgres-ssl:18',
      private: true,
      volume: '/var/lib/postgresql/data',
    },
    api: {
      image: evidence.images.api,
      private: true,
      port: 3001,
      healthcheck: '/health/ready',
      volume: '/data',
      variables: {
        NODE_ENV: 'production', WATTANAM_DISTRIBUTION: 'core', PORT: '3001', APP_VERSION: evidence.version, GIT_COMMIT: evidence.source.commit,
        DATABASE_URL: '${{Postgres.DATABASE_URL}}', JWT_SECRET: '${{secret(64)}}',
        CORS_ORIGINS: 'https://${{gateway.RAILWAY_PUBLIC_DOMAIN}}', PUBLIC_APP_URL: 'https://${{gateway.RAILWAY_PUBLIC_DOMAIN}}', COOKIE_SECURE: 'true',
        BACKUP_DIR: '/data/backups', PLUGIN_DIR: '/data/plugins', PLUGIN_DATA_DIR: '/data/plugin-data',
      },
    },
    web: {
      image: evidence.images.web,
      private: true,
      port: 3000,
      healthcheck: '/setup',
      variables: { NODE_ENV: 'production', WATTANAM_DISTRIBUTION: 'core', NEXT_PUBLIC_WATTANAM_DISTRIBUTION: 'core', PORT: '3000', API_URL: 'http://${{api.RAILWAY_PRIVATE_DOMAIN}}:3001', NEXT_PUBLIC_API_URL: '' },
    },
    gateway: {
      image: evidence.images.gateway,
      public: true,
      port: 8080,
      healthcheck: '/gateway-health',
      variables: { API_UPSTREAM: '${{api.RAILWAY_PRIVATE_DOMAIN}}:3001', WEB_UPSTREAM: '${{web.RAILWAY_PRIVATE_DOMAIN}}:3000' },
    },
  },
};

fs.writeFileSync(argument('output'), `${JSON.stringify(blueprint, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
