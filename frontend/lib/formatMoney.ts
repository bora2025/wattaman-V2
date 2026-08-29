/**
 * Formats a minor-unit amount (e.g. cents) as a currency string, using each
 * currency's actual minor-unit exponent from `Intl.NumberFormat` rather than
 * assuming 2 decimal places for everything. This is what actually distinguishes
 * a currency like JPY (0 decimals) from USD (2) -- there is no need to hardcode
 * a currency list, `Intl` already carries the correct table.
 */
export function formatMoney(amountMinor: number, currency: string, locale = 'en-US'): string {
  const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency });
  const minorUnitDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const amount = amountMinor / 10 ** minorUnitDigits;
  return formatter.format(amount);
}
