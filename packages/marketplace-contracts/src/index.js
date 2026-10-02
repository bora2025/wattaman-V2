'use strict';
const { createHash } = require('node:crypto');

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)]));
  return value;
}

function canonicalJson(value) { return JSON.stringify(normalize(value)); }
function schoolPaymentSignedPayload(installationId, ts, body) {
  const text = (value) => (value === undefined || value === null ? '' : String(value));
  return {
    purpose: 'school-payment-submission', installationId, ts,
    invoiceId: text(body.invoiceId), provider: text(body.provider), providerReference: text(body.providerReference),
    amountMinor: text(body.amountMinor), paymentMethodId: text(body.paymentMethodId), note: text(body.note),
    submittedBy: text(body.submittedBy),
    receiptSha256: typeof body.receiptImage === 'string' ? createHash('sha256').update(body.receiptImage).digest('hex') : '',
  };
}

module.exports = { canonicalJson, schoolPaymentSignedPayload };
