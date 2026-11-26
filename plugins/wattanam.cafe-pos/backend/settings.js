'use strict';

// The shop's settings: currencies and exchange rate, VAT, service charge, the receipt, KHQR and loyalty.
// Kept as one JSON value (setting "pos-settings"); percentages are stored in hundredths (1000 = 10 %).

const { PERM, fail, text, int, bool, oneOf, image, CONTRACT } = require('./shared');

const DEFAULTS = {
  baseCurrency: 'USD',      // what orders are totalled in
  rate: 4100,               // riel per US dollar, set by the owner
  khrStep: 100,             // riel amounts are rounded to this
  vatEnabled: false,
  vatRate: 1000,            // 10 %
  vatInclusive: true,       // prices already include VAT
  serviceRate: 0,           // dine-in service charge (hundredths of a percent)
  timeZone: 'Asia/Phnom_Penh',
  shopName: '',
  shopNameKh: '',
  address: '',
  phone: '',
  vatNumber: '',
  receiptFooter: 'Thank you · សូមអរគុណ',
  logo: null,
  paperWidth: 80,           // 58 or 80 mm receipts
  khqrImage: null,          // the shop's KHQR, shown to the customer to scan
  khqrName: '',
  loyaltyEnabled: false,
  loyaltySpend: 100,        // base minor units spent per point ($1 or 100៛ by default)
  loyaltyPointValue: 1,     // base minor units a redeemed point is worth
  kitchenTickets: true,     // send items to the kitchen display
  printMode: 'BROWSER',     // BROWSER: the printer's own driver; USB: a USB thermal printer through the school page
  cashDrawer: false,        // open the cash drawer (wired to the USB printer) on cash payments
  sounds: true,             // the screens' sounds (paid, error, kitchen tickets…)
  displayMenu: true,        // the customer display shows the menu (photos, prices) while nobody is at the till
};

function createSettings(context) {
  const KEY = 'pos-settings';
  const read = async () => {
    const stored = await context.settings.get(KEY, {});
    return { ...DEFAULTS, ...(stored && typeof stored === 'object' ? stored : {}) };
  };
  const validate = (body, current) => {
    const next = { ...current };
    const set = (name, parse) => { if (body[name] !== undefined) next[name] = parse(body[name]); };
    set('baseCurrency', (v) => oneOf(v, ['USD', 'KHR'], 'baseCurrency'));
    set('rate', (v) => int(v, 'Exchange rate', 1000, 10000));
    set('khrStep', (v) => { const step = int(v, 'Riel rounding', 1, 1000); if (![1, 50, 100, 500, 1000].includes(step)) throw fail('INVALID_VALUE', 'Riel rounding must be 1, 50, 100, 500 or 1000'); return step; });
    set('vatEnabled', (v) => bool(v, false));
    set('vatRate', (v) => int(v, 'VAT rate', 0, 5000));
    set('vatInclusive', (v) => bool(v, true));
    set('serviceRate', (v) => int(v, 'Service charge', 0, 3000));
    set('timeZone', (v) => { const zone = text(v, 'Time zone', 60, true); try { new Intl.DateTimeFormat('en', { timeZone: zone }); } catch { throw fail('INVALID_VALUE', 'Time zone is not known'); } return zone; });
    for (const [name, max] of [['shopName', 120], ['shopNameKh', 120], ['address', 300], ['phone', 60], ['vatNumber', 60], ['receiptFooter', 300], ['khqrName', 120]]) set(name, (v) => text(v, name, max));
    set('logo', (v) => image(v, 'Logo', 150 * 1024));
    set('khqrImage', (v) => image(v, 'KHQR picture', 300 * 1024));
    set('paperWidth', (v) => { const width = int(v, 'Paper width', 58, 80); if (![58, 80].includes(width)) throw fail('INVALID_VALUE', 'Paper width must be 58 or 80 mm'); return width; });
    set('loyaltyEnabled', (v) => bool(v, false));
    set('loyaltySpend', (v) => int(v, 'Spend per point', 1, 100000000));
    set('loyaltyPointValue', (v) => int(v, 'Point value', 0, 100000000));
    set('kitchenTickets', (v) => bool(v, true));
    set('printMode', (v) => oneOf(v, ['BROWSER', 'USB'], 'printMode'));
    set('cashDrawer', (v) => bool(v, false));
    set('sounds', (v) => bool(v, true));
    set('displayMenu', (v) => bool(v, true));
    return next;
  };
  const register = () => {
    // everyone selling needs the currencies, rate, taxes and receipt; only managers change them
    context.routes.register({ method: 'GET', path: 'settings', permission: PERM.sell, contract: CONTRACT, handler: read });
    context.routes.register({
      method: 'PUT', path: 'settings', permission: PERM.configure, contract: CONTRACT,
      handler: async (request) => {
        const next = validate(request?.body || {}, await read());
        await context.settings.set(KEY, next);
        return next;
      },
    });
  };
  return { read, register, DEFAULTS };
}

module.exports = { createSettings, DEFAULTS };
