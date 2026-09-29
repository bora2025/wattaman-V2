const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

for (const relativePath of ['Dockerfile', 'backend/Dockerfile', 'backend/Dockerfile.core']) {
  test(`${relativePath} repairs persistent update-state permissions before dropping privileges`, () => {
    const dockerfile = fs.readFileSync(path.join(root, relativePath), 'utf8');
    const command = dockerfile.match(/CMD \["sh", "-c", "([^"]+)"\]/)?.[1] || '';

    assert.match(command, /mkdir -p [^&]*\/data\/update-state/);
    assert.match(command, /chown -R node:node \/data/);
    assert.match(command, /gosu node/);
    assert.ok(command.indexOf('chown -R node:node /data') < command.indexOf('gosu node'));
  });
}

test('the repository-root Railway image installs gosu and does not switch users before volume repair', () => {
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /apt-get install[^\n]*gosu/);
  assert.doesNotMatch(dockerfile, /^USER node$/m);
});
