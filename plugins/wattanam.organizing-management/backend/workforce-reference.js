'use strict';

const EMPLOYEE = 'plugin_wattanam_organizing_management_employee';

function identifier(value, label = 'employeeId') {
  const result = String(value ?? '').trim();
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(result)) throw new Error(`${label} is invalid`);
  return result;
}

async function resolveEmployee(database, value, options = {}) {
  const reference = identifier(value);
  const columns = options.columns || '"id"';
  const active = options.active === false ? '' : ' AND "employmentStatus"<>\'TERMINATED\'';
  const lock = options.lock === true ? ' FOR UPDATE' : '';
  const rows = await database.query(
    `SELECT ${columns} FROM ${EMPLOYEE} WHERE ("id"=$1 OR "employeeNumber"=$1)${active} LIMIT 1${lock}`,
    [reference],
  );
  if (!rows.length) throw new Error(options.active === false ? 'Employee not found' : 'Active employee not found');
  return rows[0];
}

function majorToMinor(value, label) {
  const normalized = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error(`${label} must be a non-negative amount with at most 2 decimal places`);
  const result = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(result) || result > 2147483647) throw new Error(`${label} is too large`);
  return result;
}

function inputAmount(body, majorKey, minorKey) {
  if (body?.[majorKey] !== undefined && body?.[majorKey] !== null && body?.[majorKey] !== '') return majorToMinor(body[majorKey], majorKey);
  const result = Number(body?.[minorKey]);
  if (!Number.isSafeInteger(result) || result < 0 || result > 2147483647) throw new Error(`${majorKey} is required`);
  return result;
}

function withMajorAmounts(row, keys) {
  return Object.fromEntries(Object.entries(row).concat(keys.map((key) => [key.replace(/Minor$/, ''), Number(row[key] ?? 0) / 100])));
}

module.exports = { identifier, inputAmount, majorToMinor, resolveEmployee, withMajorAmounts };
