const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8'));
}

function verify() {
  const errors = [];
  const contract = readJson('infrastructure/railway/control-plane-contract.json');
  const marketplace = readJson('infrastructure/railway/marketplace-api.railway.json');
  const admin = readJson('infrastructure/railway/platform-admin.railway.json');
  const root = readJson('railway.json');

  const expectedProjectId = 'b828cc9c-57aa-46c1-8ff7-1836773f1cfa';
  if (contract.canonicalProject?.railwayProjectId !== expectedProjectId) {
    errors.push('canonical production Railway project id changed without updating the deployment guard');
  }
  if (contract.services?.['marketplace-api']?.databaseUrl !== '${{Postgres.DATABASE_URL}}') {
    errors.push('marketplace-api must use the canonical project Postgres reference');
  }
  if (contract.services?.['platform-admin-web']?.marketplaceApiUrl !== 'http://${{marketplace-api.RAILWAY_PRIVATE_DOMAIN}}:3010') {
    errors.push('platform-admin-web must use the canonical marketplace-api private domain on port 3010');
  }
  if (marketplace.build?.dockerfilePath !== contract.services['marketplace-api'].dockerfilePath) {
    errors.push('marketplace-api Dockerfile path differs from the control-plane contract');
  }
  if (admin.build?.dockerfilePath !== contract.services['platform-admin-web'].dockerfilePath) {
    errors.push('platform-admin-web Dockerfile path differs from the control-plane contract');
  }
  if (marketplace.deploy?.healthcheckPath !== '/health/ready') {
    errors.push('marketplace-api must gate deployment on /health/ready');
  }
  if (admin.deploy?.healthcheckPath !== '/login') {
    errors.push('platform-admin-web must gate deployment on /login');
  }
  if (root.build?.dockerfilePath === marketplace.build?.dockerfilePath || root.build?.dockerfilePath === admin.build?.dockerfilePath) {
    errors.push('root railway.json must remain distinct; control-plane services require their explicit config paths');
  }
  for (const [service, settings] of Object.entries(contract.services || {})) {
    if (settings.rootDirectory !== '/') errors.push(`${service} must use repository-root build context`);
    if (!settings.configPath?.startsWith('/infrastructure/railway/')) errors.push(`${service} has an unsafe config path`);
  }

  if (errors.length) throw new Error(`Control-plane deployment configuration is invalid:\n- ${errors.join('\n- ')}`);
  return contract;
}

if (require.main === module) {
  const contract = verify();
  process.stdout.write(`Control-plane config valid: ${contract.canonicalProject.name} (${contract.canonicalProject.railwayProjectId})\n`);
}

module.exports = { verify };
