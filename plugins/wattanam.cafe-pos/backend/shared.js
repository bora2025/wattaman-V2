'use strict';

// Names, errors, permissions and small helpers shared by the Café POS modules.

const crypto = require('crypto');

const ID = 'wattanam.cafe-pos';
const P = 'plugin_wattanam_cafe_pos_';
const T = {
  category: `${P}category`, product: `${P}product`, variant: `${P}variant`, group: `${P}addon_group`, addon: `${P}addon`,
  productGroup: `${P}product_addon_group`, table: `${P}dining_table`, station: `${P}kitchen_station`, customer: `${P}customer`,
  order: `${P}order`, item: `${P}order_item`, session: `${P}cash_session`, movement: `${P}cash_movement`, payment: `${P}payment`,
  refund: `${P}refund`, day: `${P}day_counter`, display: `${P}display`, supply: `${P}supply`, recipe: `${P}recipe_item`,
  stockMove: `${P}stock_movement`, loyalty: `${P}loyalty_entry`,
};
const PERM = Object.fromEntries(['sell', 'discount', 'void', 'refund', 'cash', 'kitchen', 'tables', 'menu', 'stock', 'customers', 'reports', 'configure'].map((key) => [key, `${ID}.${key}`]));
const METHODS = ['CASH', 'CARD', 'TRANSFER', 'KHQR', 'LOYALTY'];

// Errors the user sees; every other error stays a private server error.
const ERRORS = {
  FIELD_REQUIRED: { status: 400, message: 'A required field is missing', detail: true },
  FIELD_TOO_LONG: { status: 400, message: 'A field is too long', detail: true },
  INVALID_VALUE: { status: 400, message: 'A value is not valid', detail: true },
  NOT_FOUND: { status: 404, message: 'Not found', detail: true },
  ORDER_NOT_OPEN: { status: 409, message: 'This order is already paid, voided or refunded' },
  PAID_MORE_THAN_TOTAL: { status: 409, message: 'The order would cost less than what was already paid; refund first' },
  NOTHING_DUE: { status: 409, message: 'Nothing is left to pay on this order' },
  CASH_SHIFT_REQUIRED: { status: 409, message: 'Open a cash shift first (Cash Shifts)' },
  CASH_SHIFT_OPEN: { status: 409, message: 'A cash shift is already open' },
  REFUND_TOO_LARGE: { status: 409, message: 'The refund is more than what was paid' },
  NOT_ENOUGH_POINTS: { status: 409, message: 'The customer does not have enough points' },
  CUSTOMER_REQUIRED: { status: 409, message: 'Choose the customer first' },
  ITEM_UNAVAILABLE: { status: 409, message: 'An item is no longer on the menu', detail: true },
  ADDONS_INVALID: { status: 400, message: 'The choices for an item are not valid', detail: true },
  PHONE_TAKEN: { status: 409, message: 'Another customer has this phone number' },
};
const fail = (code, message) => Object.assign(new Error(message || ERRORS[code].message), { code, isPluginContractError: true });
const CONTRACT = { version: '1.0', response: { parse: (value) => value }, errors: ERRORS };

const newId = () => crypto.randomUUID();
const text = (value, label, max, required) => {
  const result = value === undefined || value === null ? '' : String(value).trim();
  if (required && !result) throw fail('FIELD_REQUIRED', `${label} is required`);
  if (result.length > max) throw fail('FIELD_TOO_LONG', `${label} is too long (at most ${max} characters)`);
  return result;
};
const optional = (value, label, max) => text(value, label, max) || null;
const int = (value, label, min, max) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw fail('INVALID_VALUE', `${label} must be a whole number from ${min} to ${max}`);
  return number;
};
const bool = (value, fallback) => (value === undefined ? fallback : value === true || value === 'true');
const oneOf = (value, list, label) => {
  const result = String(value || '').toUpperCase();
  if (!list.includes(result)) throw fail('INVALID_VALUE', `${label} must be one of ${list.join(', ')}`);
  return result;
};
const idOf = (value, label = 'id') => {
  const result = String(value || '');
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(result)) throw fail('INVALID_VALUE', `${label} is not valid`);
  return result;
};
const jsonList = (value) => {
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
};
const iso = (value) => (value instanceof Date ? value.toISOString() : value ? new Date(value).toISOString() : null);
const num = (value) => (value === null || value === undefined ? null : Number(value));
// A picture kept with the record (menu photos, the receipt logo, the shop's KHQR): a data URL, small.
const image = (value, label, maxBytes = 300 * 1024) => {
  const result = String(value || '');
  if (!result) return null;
  if (!/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(result) || result.length > maxBytes * 1.37) throw fail('INVALID_VALUE', `${label} must be a PNG, JPEG or WebP picture of at most ${Math.round(maxBytes / 1024)} KB`);
  return result;
};
// The shop's business day (orders are numbered per day), in its time zone.
const businessDate = (date, timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'Asia/Phnom_Penh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date || new Date());
// A DATE column as YYYY-MM-DD (the driver gives local midnight: read it with local getters, never as UTC).
const dateOnly = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const pad = (n) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
};
const isoDate = (value, label) => {
  const result = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00Z`))) throw fail('INVALID_VALUE', `${label} must be a date (YYYY-MM-DD)`);
  return result;
};

module.exports = { ID, T, PERM, METHODS, ERRORS, CONTRACT, fail, newId, text, optional, int, bool, oneOf, idOf, jsonList, iso, num, image, businessDate, isoDate, dateOnly };
