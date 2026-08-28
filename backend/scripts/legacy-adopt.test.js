'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { parseInput, readJournal } = require('./legacy-adopt');

const valid = {
  ADOPT_NON_INTERACTIVE: 'true', ADOPT_SCHOOL_NAME: 'Legacy School', ADOPT_SCHOOL_SLUG: 'legacy-school',
  ADOPT_CONFIRM_SLUG: 'legacy-school', ADOPT_OWNER_EMAIL: 'OWNER@EXAMPLE.COM',
  ADOPT_APPROVED_SCHEMA_FINGERPRINT: 'a'.repeat(64), APP_VERSION: '1.0.0',
};

test('parses guarded adoption input with Cambodia defaults', () => {
  const input = parseInput(valid);
  assert.equal(input.ownerEmail, 'owner@example.com');
  assert.equal(input.timezone, 'Asia/Phnom_Penh');
  assert.equal(input.currency, 'KHR');
});

test('requires guard, exact slug, fingerprint, and valid timezone', () => {
  assert.throws(() => parseInput({ ...valid, ADOPT_NON_INTERACTIVE: 'false' }), /ADOPT_NON_INTERACTIVE/);
  assert.throws(() => parseInput({ ...valid, ADOPT_CONFIRM_SLUG: 'other' }), /exactly match/);
  assert.throws(() => parseInput({ ...valid, ADOPT_APPROVED_SCHEMA_FINGERPRINT: 'bad' }), /SHA-256/);
  assert.throws(() => parseInput({ ...valid, ADOPT_TIMEZONE: 'Invalid\/Zone' }), /IANA/);
});

test('journal verification binds school, fingerprint, archive, and checksum', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wattanam-adopt-'));
  try {
    const archive = path.join(directory, 'wattanam-test.dump');
    fs.writeFileSync(archive, 'archive');
    fs.writeFileSync(path.join(directory, 'wattanam-test.manifest.json'), '{}');
    const crypto = require('crypto');
    const checksum = crypto.createHash('sha256').update('archive').digest('hex');
    const journalFile = path.join(directory, 'legacy-adoption-legacy-school.json');
    fs.writeFileSync(journalFile, JSON.stringify({ format: 'wattanam-legacy-adoption-v1', schoolSlug: 'legacy-school', sourceFingerprint: 'a'.repeat(64), backup: { file: 'wattanam-test.dump', sha256: checksum } }));
    assert.equal(readJournal(journalFile, parseInput(valid)).backup.sha256, checksum);
    fs.writeFileSync(archive, 'tampered');
    assert.throws(() => readJournal(journalFile, parseInput(valid)), /checksum mismatch/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
