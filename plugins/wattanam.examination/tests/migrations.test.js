'use strict';
// The school core runs each migration as ONE statement ("Migration … must contain exactly one SQL statement").
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));

function statements(sql) {
  const text = sql.replace(/--[^\n]*/g, '').replace(/'(?:[^']|'')*'/g, "''");
  return text.split(';').map((part) => part.trim()).filter(Boolean);
}

test('every migration is exactly one SQL statement with its declared checksum', () => {
  for (const migration of manifest.migrations) {
    const file = fs.readFileSync(path.join(root, migration.path));
    assert.strictEqual(statements(file.toString('utf8')).length, 1, `${migration.id} must contain exactly one SQL statement`);
    assert.match(file.toString('utf8'), new RegExp(`^-- wattanam-plugin-migration: ${migration.id}\\b`), migration.id);
    assert.strictEqual(crypto.createHash('sha256').update(file).digest('hex'), migration.checksum, migration.id);
  }
});
