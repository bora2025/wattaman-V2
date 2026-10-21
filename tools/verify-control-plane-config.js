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
  const iac = fs.readFileSync(path.join(repositoryRoot, '.railway/railway.ts'), 'utf8');

  const expectedProjectId = '1c5b1561-512d-44bd-b6ae-b2486b8d18a4';
  if (contract.canonicalProject?.railwayProjectId !== expectedProjectId) {
    errors.push('canonical production Railway project id changed without updating the deployment guard');
  }
  if (contract.iacPath !== '/.railway/railway.ts' || contract.variables !== 'unmanaged') {
    errors.push('control plane must declare Railway IaC with externally managed secrets');
  }
  for (const resource of ['Postgres', 'marketplace-api', 'platform-admin-web', 'marketplace-artifacts', 'marketplace-api-volume']) {
    if (!iac.includes(`\"${resource}\"`)) errors.push(`Railway IaC is missing ${resource}`);
  }
  if (!iac.includes('variables: { managed: false }')) errors.push('Railway IaC must not import or manage service secrets');
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
  for (const obsoletePath of ['railway.json', 'apps/marketplace-api/railway.json', 'apps/platform-admin/railway.json']) {
    if (fs.existsSync(path.join(repositoryRoot, obsoletePath))) {
      errors.push(`${obsoletePath} is ambiguous; control-plane services must use only their canonical infrastructure config paths`);
    }
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
