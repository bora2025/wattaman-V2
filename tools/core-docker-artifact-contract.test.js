const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('core API image builds and starts only the physical core bundle and schema', () => {
  const dockerfile = fs.readFileSync(path.join(root, 'backend', 'Dockerfile.core'), 'utf8');
  const packageJson = JSON.parse(read('backend/package.json'));
  assert.match(dockerfile, /npm run build:core/);
  assert.match(dockerfile, /FROM node:20-slim AS production-dependencies/);
  assert.match(dockerfile, /npm ci --omit=dev --legacy-peer-deps --ignore-scripts/);
  assert.match(dockerfile, /--from=production-dependencies \/app\/node_modules/);
  assert.match(dockerfile, /--from=production-dependencies \/app\/generated/);
  assert.match(dockerfile, /cp -R generated\/core-client node_modules\/\.prisma\/client/);
  assert.match(dockerfile, /prisma\/core\/schema\.prisma/);
  assert.match(dockerfile, /prisma generate --schema=prisma\/schema\.prisma/);
  assert.match(dockerfile, /WATTANAM_DISTRIBUTION=core/);
  assert.match(dockerfile, /node dist-core\/main\.js/);
  assert.doesNotMatch(dockerfile, /COPY --chown=node:node --from=builder \/app\/dist \.\/dist/);
  assert.doesNotMatch(dockerfile, /COPY --chown=node:node --from=builder \/app\/prisma \.\/prisma/);
  assert.doesNotMatch(dockerfile, /COPY --chown=node:node --from=builder \/app\/prisma\/schema\.prisma/);
  assert.doesNotMatch(dockerfile, /--from=builder \/app\/node_modules/);
  assert.equal(packageJson.dependencies.prisma, '^5.22.0');
  assert.equal(packageJson.devDependencies.prisma, undefined);
});

test('core compiler follows only the core entry graph and bundles the reduced Prisma client', () => {
  const tsconfig = JSON.parse(read('backend/tsconfig.core.json'));
  const webpack = read('backend/webpack.core.config.js');
  assert.deepEqual(tsconfig.files, ['src/main-core.ts']);
  assert.match(webpack, /'@prisma\/client\$'/);
  assert.match(webpack, /generated\/core-client/);
});

test('core web image packages the isolated core workspace output', () => {
  const dockerfile = fs.readFileSync(path.join(root, 'frontend', 'Dockerfile.core'), 'utf8');
  assert.match(dockerfile, /npm run build:core/);
  assert.match(dockerfile, /\.core-build\/\.next\/standalone/);
  assert.match(dockerfile, /NEXT_PUBLIC_WATTANAM_DISTRIBUTION=core/);
  assert.match(dockerfile, /CORE_BUILD_NODE_MODULES_MODE=copy/);
  assert.doesNotMatch(dockerfile, /\/app\/\.next\/standalone/);
});

test('gateway image keeps the school web, API, marketplace, socket, and health routes', () => {
  const dockerfile = read('infrastructure/gateway/Dockerfile');
  const config = read('infrastructure/gateway/default.conf.template');
  assert.match(dockerfile, /FROM nginx:stable-alpine/);
  assert.match(dockerfile, /apk upgrade --no-cache/);
  assert.match(dockerfile, /NGINX_ENVSUBST_FILTER="\^\(API_UPSTREAM\|WEB_UPSTREAM\)\$"/);
  assert.match(config, /location = \/gateway-health/);
  assert.match(config, /location \^~ \/socket\.io\//);
  assert.match(config, /location \^~ \/api\/marketplace\//);
  assert.match(config, /location \/api\//);
  assert.match(config, /proxy_pass http:\/\/\$\{API_UPSTREAM\}\//);
  assert.match(config, /proxy_pass http:\/\/\$\{WEB_UPSTREAM\}/);
});
