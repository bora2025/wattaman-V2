'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { createHash } = require('node:crypto');
const { canonicalJson, schoolPaymentSignedPayload } = require('./index');

test('canonical JSON is stable across object key order', () => {
  assert.equal(canonicalJson({ z: [3, { b: 2, a: 1 }], a: true }), '{"a":true,"z":[3,{"a":1,"b":2}]}');
});

test('school payment projection binds every approved field and hashes the receipt', () => {
  const body = { invoiceId: 'invoice-1', amountMinor: 500, receiptImage: 'receipt', ignored: 'not-signed' };
  assert.deepEqual(schoolPaymentSignedPayload('school-1', '123', body), {
    purpose: 'school-payment-submission', installationId: 'school-1', ts: '123', invoiceId: 'invoice-1',
    provider: '', providerReference: '', amountMinor: '500', paymentMethodId: '', note: '', submittedBy: '',
    receiptSha256: createHash('sha256').update('receipt').digest('hex'),
  });
});
