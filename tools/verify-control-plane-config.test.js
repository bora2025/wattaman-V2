const assert = require('node:assert/strict');
const test = require('node:test');
const { verify } = require('./verify-control-plane-config');

test('canonical production control-plane deployment contract is internally consistent', () => {
  const contract = verify();
  assert.equal(contract.environment, 'production');
  assert.equal(contract.services['marketplace-api'].rootDirectory, '/');
  assert.equal(contract.services['platform-admin-web'].rootDirectory, '/');
  assert.equal(
    contract.services['platform-admin-web'].marketplaceApiUrl,
    'http://${{marketplace-api.RAILWAY_PRIVATE_DOMAIN}}:3010',
  );
  assert.notEqual(
    contract.services['marketplace-api'].dockerfilePath,
    contract.services['platform-admin-web'].dockerfilePath,
  );
});
