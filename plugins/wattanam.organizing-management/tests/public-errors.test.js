'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const withPublicErrors = require('../backend/public-errors');

test('attendance business rejections use the declared SDK error contract', async () => {
  let registered;
  const context = {
    errors: { contract: (code, diagnostic) => Object.assign(new Error(diagnostic), { code, isPluginContractError: true }) },
    routes: { register: (definition) => { registered = definition; return () => undefined; } },
  };
  const wrapped = withPublicErrors(context);
  wrapped.routes.register({
    method: 'POST', path: 'attendance/scan', permission: 'scan',
    handler: async () => { throw new Error('NOT_A_CONFIGURED_WORK_DAY'); },
  });
  assert.equal(registered.contract.version, '1.0');
  assert.deepEqual(registered.contract.errors.NOT_A_CONFIGURED_WORK_DAY, { status: 409, message: 'Today is not configured as a working day.' });
  await assert.rejects(registered.handler({}), (error) => error.code === 'NOT_A_CONFIGURED_WORK_DAY' && error.isPluginContractError === true);
});

test('dynamic early checkout diagnostics map to a stable public code', async () => {
  let registered;
  const context = {
    errors: { contract: (code, diagnostic) => Object.assign(new Error(diagnostic), { code, isPluginContractError: true }) },
    routes: { register: (definition) => { registered = definition; return () => undefined; } },
  };
  const wrapped = withPublicErrors(context);
  wrapped.routes.register({
    method: 'POST', path: 'attendance/scan', permission: 'scan',
    handler: async () => { throw new Error('CHECK_OUT_TOO_SOON_24_MINUTES'); },
  });
  await assert.rejects(registered.handler({}), (error) => error.code === 'CHECK_OUT_TOO_SOON' && error.message === 'CHECK_OUT_TOO_SOON_24_MINUTES');
});

test('unexpected failures remain private server errors', async () => {
  let registered;
  const context = {
    errors: { contract: (code, diagnostic) => Object.assign(new Error(diagnostic), { code, isPluginContractError: true }) },
    routes: { register: (definition) => { registered = definition; return () => undefined; } },
  };
  const wrapped = withPublicErrors(context);
  wrapped.routes.register({ method: 'POST', path: 'attendance/scan', permission: 'scan', handler: async () => { throw new Error('database credential leaked'); } });
  await assert.rejects(registered.handler({}), /database credential leaked/);
});
