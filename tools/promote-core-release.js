'use strict';

const required = (name) => { if (!process.env[name]) throw new Error(`${name} is required`); return process.env[name]; };
fetch(new URL('/admin/v1/core-releases/promote', required('MARKETPLACE_URL')), {
  method: 'POST', headers: { authorization: `Bearer ${required('MARKETPLACE_ADMIN_TOKEN')}`, 'content-type': 'application/json' },
  body: JSON.stringify({ version: required('VERSION') }),
}).then(async (response) => { if (!response.ok) throw new Error(`Promotion failed (${response.status}): ${await response.text()}`); process.stdout.write(`${await response.text()}\n`); });
