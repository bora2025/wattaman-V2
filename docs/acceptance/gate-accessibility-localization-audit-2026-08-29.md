# Accessibility, Localization, and Provider Integration Audit — 2026-08-29

## Context

`docs/platform-master-execution-plan.md` §13.6 requires: "Launch workflows support Khmer/
English text expansion, Unicode search/input, Asia/Phnom_Penh, USD/KHR formatting, accessible
keyboard/focus/error behavior, and low-bandwidth recovery." The completion checklist had this
marked `[ ]` "not yet evidenced." A code audit found that claim was largely **wrong** — most
of this already exists and works; the real gaps are narrower than "nothing exists."

## What already exists (correcting the "no evidence yet" claim)

- **Khmer/English i18n**: `frontend/lib/i18n.tsx` has a complete custom `LanguageProvider`
  with full English and Khmer dictionaries (the Khmer one alone is ~830 lines of real
  Khmer-script UI strings), a working language switcher in `Sidebar.tsx`, and choice persisted
  to `localStorage`.
- **Khmer font rendering**: `frontend/app/layout.tsx` loads Noto Sans Khmer via
  `next/font/google` (weights 400–700) alongside decorative Khmer display fonts (Battambang,
  Hanuman, Moul) via a Google Fonts `<link>`.
- **Unicode search/input**: backend search (e.g. `auth.service.ts`'s user search) uses
  Postgres `ILIKE`-equivalent `contains`/`insensitive` matching, which is Unicode-correct.
  Name/text DTO validation uses non-whitespace (`\S`) patterns, not Latin-only regexes — Khmer
  names are not rejected anywhere found.
- **Low-bandwidth recovery**: this is the most mature of the seven areas audited. A real
  IndexedDB-backed offline queue (`frontend/lib/offline-attendance.ts`) captures QR attendance
  scans while offline and flushes them on reconnect; `NetworkQualityBadge.tsx` surfaces live
  connection-quality state; a service worker (`frontend/public/sw.js`) does network-first
  caching of the app shell.
- **Cambodia-specific date/time formatting**: `frontend/lib/dateUtils.ts` already formats
  times and dates in `Asia/Phnom_Penh` (including Khmer-numeral dates via
  `toLocaleDateString('km-KH-u-nu-khmr', ...)` for ID cards), and `install-cli.ts`'s
  unattended-install defaults (`locale: 'en-KH'`, `timezone: 'Asia/Phnom_Penh'`,
  `currency: 'KHR'`) are a deliberate, internally consistent match to DEC-005's proposed
  Cambodia-first launch region — not an inconsistency, despite differing from the Prisma
  schema's neutral fallback defaults (`en`/`UTC`/`USD`), which exist only for the case of a
  row created outside the normal install flow.

## Real gaps found and fixed this pass

- **Accessible dialog semantics** (`frontend/components/ConfirmModal.tsx`, shared across 6
  call sites): had no `role="dialog"`/`aria-modal`, no keyboard equivalent to clicking outside
  to cancel, and no managed focus at all. Added `role="dialog"`, `aria-modal="true"`,
  `aria-labelledby` pointing at the title, an Escape-key handler, initial focus placed on
  Cancel (not Confirm — so a stray Enter right after the dialog opens can't confirm a
  destructive action), and a minimal Tab focus trap cycling between the two buttons.
- **Currency formatting**: money display was ad-hoc `'$' + amount.toFixed(2)` string
  concatenation everywhere, ignoring the school's actual configured currency entirely. New
  `frontend/lib/formatMoney.ts` uses `Intl.NumberFormat`'s own per-currency minor-unit table
  (this is what already correctly gives JPY 0 decimals vs. USD's 2 — verified directly with
  Node's `Intl` rather than assumed; confirmed KHR is treated as a 2-decimal currency by the
  ECMAScript/ISO 4217 standard, contrary to the common assumption that it's zero-decimal in
  practice) instead of hardcoding both the symbol and the decimal count. The one spot that
  already threads a real per-product currency code through (`frontend/app/marketplace/page.tsx`'s
  price display — a marketplace plugin can be priced in something other than USD) is currently
  uncommitted work from a concurrent session, so wiring `formatMoney()` into it was tried,
  confirmed working, then deliberately reverted rather than silently mixing an edit into a
  file this pass doesn't own into whatever that session eventually commits. `formatMoney()`
  itself is real, tested, and ready to wire in — either there or into any future
  installation-currency-aware page.

## What's still a real gap, stated plainly

- Most other money-display spots (`accounter/budget`, `accounter/page.tsx`, the dashboard
  class-price card) still hardcode a `$` prefix rather than reading `Installation.currency` —
  not fixed this pass. These pages don't currently fetch installation config at all, so wiring
  them is a separate, larger change (an installation-config context/provider, mirroring
  `LanguageProvider`), not a one-line swap like the marketplace fix was. Given DEC-005 isn't
  formally accepted yet and every real deployment to date is USD, this isn't urgent, but it's
  real: a school configured with `currency: "KHR"` would still see `$` throughout the rest of
  the app today.
- ARIA/keyboard coverage was spot-checked, not exhaustively swept: only 24 of 182 `.tsx` files
  under `app/`+`components/` contain any `aria-*` attribute at all. `ConfirmModal.tsx` was
  fixed as the highest-leverage shared component; other custom dropdowns/modals elsewhere in
  the app were not individually audited or fixed.
- i18n dictionary *completeness* wasn't verified — the Khmer dictionary is large and real, but
  whether every user-facing string in every page has a translation key (versus falling back to
  untranslated English text somewhere) wasn't checked page-by-page.
- No automated accessibility testing (`eslint-plugin-jsx-a11y` is only present transitively
  via `next/core-web-vitals`, not explicitly configured or enforced as a dedicated CI gate;
  no axe-core/Lighthouse CI check exists).

## Verification

- `npm run build` (frontend, `next build --webpack`) passes cleanly with both changes; this
  also serves as the typecheck gate per the new PR-validation pipeline's own convention.
- `formatMoney()`'s currency-decimal handling was verified directly against Node's real
  `Intl.NumberFormat` (USD/EUR → 2 decimals, JPY → 0, KHR → 2), not assumed.
- No browser automation is available in this environment (the same B-004/E2E gap noted
  elsewhere), so `ConfirmModal`'s keyboard/focus behavior was verified by code review and the
  type/build checks above, not by driving a real browser. Stated plainly rather than implied
  as tested.
