const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const contract = JSON.parse(fs.readFileSync(path.join(root, 'docs/architecture/core-schema-contract.json'), 'utf8'));
const ownership = JSON.parse(fs.readFileSync(path.join(root, 'docs/architecture/ownership-manifest.json'), 'utf8'));
const legacySchema = fs.readFileSync(path.join(root, 'backend/prisma/schema.prisma'), 'utf8');

function modelBlocks(source) {
  return new Map([...source.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)].map((match) => [match[1], match[2]]));
}

test('LC2-014: clean core model set exactly follows accepted ownership', () => {
  const expected = Object.entries(ownership.models)
    .filter(([, value]) => value.owner === 'lean-core')
    .map(([name]) => name);
  assert.deepEqual(contract.freshCore.models, expected);
  assert.equal(new Set(contract.freshCore.models).size, contract.freshCore.models.length);
  assert.ok(contract.freshCore.models.every((name) => ownership.models[name].owner === 'lean-core'));
});

test('LC2-014: every current cross-owner core relation is an explicit split blocker', () => {
  const blocks = modelBlocks(legacySchema);
  const discovered = [];
  for (const model of contract.freshCore.models) {
    for (const line of (blocks.get(model) || '').split(/\r?\n/)) {
      const field = line.trim().match(/^(\w+)\s+([A-Za-z]\w*)(?:\[\])?\??(?:\s|$)/);
      if (!field || !ownership.models[field[2]] || ownership.models[field[2]].owner === 'lean-core') continue;
      discovered.push(`${model}.${field[1]}->${field[2]}`);
    }
  }
  assert.deepEqual(discovered.sort(), [...contract.legacyCrossOwnerRelations].sort());
  assert.ok(contract.identityFieldSplits.includes('User.departmentId'));
  for (const relation of discovered) assert.ok(contract.identityFieldSplits.includes(relation.split('->')[0]));
});

test('LC2-014: fresh core and legacy use distinct immutable lineages', () => {
  assert.notEqual(contract.freshCore.schemaPath, contract.legacy.schemaPath);
  assert.notEqual(contract.freshCore.migrationPath, contract.legacy.migrationPath);
  assert.notEqual(contract.freshCore.lineage, contract.legacy.lineage);
  assert.equal(contract.legacy.allowDestructiveCoreConversion, false);
});

test('LC2-015: generated core Prisma schema contains only the closed core model graph', () => {
  const corePath = path.join(root, contract.freshCore.schemaPath);
  assert.ok(fs.existsSync(corePath), 'run npm run schema:core:write');
  const coreSchema = fs.readFileSync(corePath, 'utf8');
  const coreBlocks = modelBlocks(coreSchema);
  assert.deepEqual([...coreBlocks.keys()], contract.freshCore.models);
  for (const [model, block] of coreBlocks) {
    for (const line of block.split(/\r?\n/)) {
      const field = line.trim().match(/^(\w+)\s+([A-Za-z]\w*)(?:\[\])?\??(?:\s|$)/);
      if (field && ownership.models[field[2]]) {
        assert.ok(coreBlocks.has(field[2]), `${model}.${field[1]} references absent ${field[2]}`);
      }
    }
  }
  for (const removal of contract.identityFieldSplits) {
    const [model, field] = removal.split('.');
    assert.doesNotMatch(coreBlocks.get(model), new RegExp(`^\\s*${field}\\s+`, 'm'), removal);
  }
});
