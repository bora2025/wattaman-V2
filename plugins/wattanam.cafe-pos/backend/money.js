'use strict';

// Money for Café POS. Every amount is an integer in MINOR units: US cents for USD, riel for KHR (riel has no
// smaller unit). An order has one base currency (the shop's setting) and keeps the exchange rate it was made
// with (riel per US dollar), so later rate changes never alter it. Nothing here touches the database.

const CURRENCIES = ['USD', 'KHR'];

/** Rounds half away from zero (money must not depend on floating-point ties). */
function round(value) {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** An amount from one currency to another at `rate` riel per dollar (minor units both ways). */
function convert(amount, from, to, rate) {
  if (from === to) return amount;
  if (!Number.isInteger(rate) || rate <= 0) throw new Error('rate must be a positive whole number of riel per dollar');
  return from === 'USD' ? round((amount * rate) / 100) : round((amount * 100) / rate);
}

/** Riel rounded to the nearest `step` (100 by default: the smallest note in daily use). */
function roundRiel(amount, step = 100) {
  return step > 1 ? round(amount / step) * step : amount;
}

/**
 * An order's totals, in its base currency.
 *   lines: [{ lineTotal, taxable }] (base minor units, already quantity × unit price)
 *   discount: { type: 'PERCENT' | 'AMOUNT', value } (percent in hundredths: 1050 = 10.5 %; amount in base minor)
 *   serviceRate: service charge in hundredths of a percent (dine-in), on the discounted amount
 *   vat: { enabled, rate (hundredths of a percent), inclusive }
 *   base, khrStep: riel totals are rounded to khrStep (the difference is the round-off)
 */
function orderTotals({ lines, discount, serviceRate = 0, vat, base = 'USD', khrStep = 100 }) {
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const taxableSubtotal = lines.filter((line) => line.taxable !== false).reduce((sum, line) => sum + line.lineTotal, 0);
  let discountAmount = 0;
  if (discount && discount.type === 'PERCENT') discountAmount = round((subtotal * Math.min(10000, Math.max(0, discount.value))) / 10000);
  else if (discount && discount.type === 'AMOUNT') discountAmount = Math.min(subtotal, Math.max(0, discount.value));
  const afterDiscount = subtotal - discountAmount;
  const serviceCharge = round((afterDiscount * Math.max(0, serviceRate)) / 10000);
  // the discount and service charge are shared out over taxable and non-taxable lines by their share
  const taxableShare = subtotal ? taxableSubtotal / subtotal : 0;
  const taxableBase = round((afterDiscount + serviceCharge) * taxableShare);
  let tax = 0;
  let total = afterDiscount + serviceCharge;
  if (vat && vat.enabled && vat.rate > 0) {
    if (vat.inclusive) tax = round((taxableBase * vat.rate) / (10000 + vat.rate));
    else { tax = round((taxableBase * vat.rate) / 10000); total += tax; }
  }
  let roundOff = 0;
  if (base === 'KHR') { const rounded = roundRiel(total, khrStep); roundOff = rounded - total; total = rounded; }
  return { subtotal, discount: discountAmount, serviceCharge, tax, taxInclusive: Boolean(vat && vat.inclusive), roundOff, total };
}

/**
 * Cash handed over in dollars and/or riel against what is still due (`due`, base minor units).
 * Returns what the payment counts for (never more than due), and the change: whole dollars back in
 * dollars, the rest in riel rounded to `khrStep` (the usual way in Cambodia). With a riel base, all change
 * is given in riel.
 */
function cashTender({ due, usd = 0, khr = 0, base = 'USD', rate, khrStep = 100 }) {
  if (![usd, khr, due].every((v) => Number.isInteger(v) && v >= 0)) throw new Error('amounts must be whole minor units');
  const tendered = convert(usd, 'USD', base, rate) + convert(khr, 'KHR', base, rate);
  if (tendered <= due) return { tendered, amount: tendered, change: 0, changeUsd: 0, changeKhr: 0 };
  const change = tendered - due;
  if (base === 'KHR') return { tendered, amount: due, change, changeUsd: 0, changeKhr: roundRiel(change, khrStep) };
  const changeUsd = Math.floor(change / 100) * 100;
  const changeKhr = roundRiel(convert(change - changeUsd, 'USD', 'KHR', rate), khrStep);
  return { tendered, amount: due, change, changeUsd, changeKhr };
}

/** What a riel amount is worth here, for "you may pay 20,500៛" next to a dollar total. */
function inOther(amount, base, rate, khrStep = 100) {
  return base === 'USD' ? { currency: 'KHR', amount: roundRiel(convert(amount, 'USD', 'KHR', rate), khrStep) } : { currency: 'USD', amount: convert(amount, 'KHR', 'USD', rate) };
}

module.exports = { CURRENCIES, round, convert, roundRiel, orderTotals, cashTender, inOther };
