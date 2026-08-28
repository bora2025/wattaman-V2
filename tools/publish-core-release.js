'use strict';

const required = (name) => { if (!process.env[name]) throw new Error(`${name} is required`); return process.env[name]; };
const base = new URL(required('MARKETPLACE_URL'));
const payload = {
  version: required('VERSION'), channel: 'BETA', nodeRange: '>=20 <21', postgresRange: '>=16 <19',
  apiImage: required('API'), webImage: required('WEB'), gatewayImage: required('GATEWAY'), releaseNotes: required('NOTES'),
};
fetch(new URL('/admin/v1/core-releases', base), {
  method: 'POST', headers: { authorization: `Bearer ${required('MARKETPLACE_ADMIN_TOKEN')}`, 'content-type': 'application/json' }, body: JSON.stringify(payload),
}).then(async (response) => { if (!response.ok) throw new Error(`Publish failed (${response.status}): ${await response.text()}`); process.stdout.write(`${await response.text()}\n`); });
