# Billing a Customer School: Subscription and Plugins on One Bill

Status: plan, not implemented. Written 2026-09-10.

## Context

Two money systems exist in this repository and they never meet.

**The subscription.** `SchoolBillingPlan` carries a currency, an amount, `MONTHLY | ANNUAL`, and
`dueDays`; a school points at one through `CustomerSchool.billingPlanId`. `issuePlanInvoice`
(`school-billing.service.ts:236`) mints one `SchoolInvoice` for one period. Money arrives as a
customer-declared `SchoolPaymentSubmission` that a finance operator verifies into an append-only
`SchoolPayment`. Dunning is `SchoolBillingNotification` driven by `dispatchDueAlerts` hourly, and
non-payment ends with `installationControl` returning `SUSPENDED` to the school itself.

**The plugins.** `MarketplaceOrder` and `MarketplaceOrderLine` are priced from `ProductPrice`, paid
through `MarketplacePayment` — either the HMAC webhook at `/v1/payments/webhooks/online-hmac-v1` or
an operator's manual settlement — and the entitlement is minted *inside the payment transaction*
(`commerce.service.ts:88-111`). Plugin pricing is one-off, not recurring: `licenseDays` defaults to
3650 and `updatesDays` to 365, which is a perpetual licence with a year of updates.

Five facts, each confirmed in code rather than assumed, constrain everything below.

1. **A school invoice has no lines.** `SchoolInvoice` is a single `description` and a single
   `amountMinor` (`schema.prisma:604`). "Subscription 50.00 + Attendance Pro 120.00" cannot be
   expressed — not in the schema, not in the operator console, not in the customer portal.
2. **Nothing recurs.** `issuePlanInvoice` is a button. `main.ts:16` schedules only
   `dispatchDueAlerts`; no job anywhere issues the next period's invoice. Today a monthly plan means
   a person clicking once per school per month, forever, and remembering which schools they did.
3. **The separation is a decision already written down.** `schema.prisma:601` — *"Platform service
   invoices owed by a customer school. These are separate from plugin orders."* Putting plugins on
   the school bill reverses that sentence, so the work starts by amending it rather than quietly
   contradicting it.
4. **Entitlements are issued at payment, never on credit.** There is no code path that grants a paid
   plugin before money has settled.
5. **Publisher revenue attribution is manual.** The only `publisherRevenueEntry.create` in the
   codebase is a `CORRECTION` (`publisher-governance.service.ts:227`). No paid order line writes
   one. This is not a regression the plan introduces; it is a hole the plan makes more visible.

## Two bugs to fix regardless of which option is chosen

Both are live today and cost almost nothing to fix alongside Increment 1.

**Double-billing a period.** `issuePlanInvoice` has no period-uniqueness guard; deduplication rests
entirely on `idempotencyKey`, and `SchoolDetail.tsx:118` generates a fresh `crypto.randomUUID()` on
every click. Pressing "Invoice central price" twice bills the school twice for the same month — two
invoice numbers, two dunning tracks, two independent suspension clocks. The fix is a partial unique
index on `(customerSchoolId, billingPlanId, periodStart)` excluding voided rows, so the database
refuses the second one rather than relying on an operator not double-clicking.

**Due dates drift when back-issuing.** `issuePlanInvoice` computes `dueAt` from `new Date()`, not
from `periodStart`. Issuing January's invoice in March dates it from March, quietly granting a late
invoice a full fresh grace period. Derive `dueAt` from `periodStart + dueDays`.

## The decision this plan forces into the open

Plugins are pay-first and entitlements are minted at settlement. A school invoice is net-14. Those
two facts cannot both survive when a plugin appears on a school invoice: either the school waits two
weeks for a plugin it has agreed to buy, or the entitlement is granted on credit.

**Recommendation: grant on credit, and say so out loud.** You already hold a far larger lever — an
unpaid invoice suspends the entire school through `installationControl`. Against that, one plugin
entitlement is small collateral, and the alternative is a worse product: a customer who has agreed
to buy, waiting fourteen days for software you have already approved.

So the plan issues the entitlement when the purchase is approved, records which invoice line it was
billed on, and revokes it if that invoice is voided.

**The narrower alternative, if extending credit is unacceptable:** keep plugins pay-first and put
only a *reference* to already-settled plugin orders on the school invoice, as a zero-value memo
section. The customer gets one document to read, no credit is extended, and no revocation logic is
needed. It is a smaller change and a worse answer; it is written up under Increment 3 as the
fallback so the choice stays open until Increment 3 actually starts.

Increments 1 and 2 stand on their own and are worth doing whichever way this lands.

## Design

### Increment 1 — Invoice lines

The prerequisite for everything else, and independently worth having: today a customer receives an
invoice reading "Standard (monthly)" and a number, with no breakdown at all.

**New model** `SchoolInvoiceLine`: `invoiceId`, `kind (SUBSCRIPTION | PLUGIN | ADJUSTMENT | CREDIT)`,
`description`, `quantity`, `unitAmountMinor`, `amountMinor`, `taxMinor`, `periodStart?`, `periodEnd?`,
plus nullable provenance columns (`billingPlanId?`, `sourceOrderLineId?`) so a line can say where it
came from, and a `position` so an invoice reads in a stable order.

**Carry tax from the first version even though nothing charges it yet.** Cambodian VAT is 10%.
A `taxMinor` column costs nothing now, while retrofitting tax onto invoices customers have already
received costs a great deal. Default it to 0 and leave it unused until someone decides Wattanam must
charge VAT.

`SchoolInvoice.amountMinor` stays and becomes a total the invoice's lines must sum to — verified
inside the transaction that writes them, in the same spirit as `commerce.service.ts:82` refusing an
order whose lines no longer match its total. It is deliberately not dropped: the dunning path, the
suspension gate, and the school-side sync all read it, and a stored total is what keeps those cheap.

**Migration.** Every existing invoice gets exactly one `SUBSCRIPTION` or `ADJUSTMENT` line
reproducing its current `description` and `amountMinor`. No historical invoice changes value, and
from that point on every invoice has lines.

**Surfaces to update in the same change**, or the feature is invisible where it matters:
`INVOICE_SELECT` (`school-billing.service.ts:50`), `customerBilling`, and `installationControl` —
which feeds the school's own `billingJson` — plus `SchoolDetail.tsx`, the customer portal, and the
school-side `frontend/app/admin/platform-billing/page.tsx` with its `PlatformBillingControl` type in
`frontend/app/admin/page.tsx`.

### Increment 2 — The subscription actually recurring

**A scheduler**, following the shape `dispatchDueAlerts` already established at `main.ts:14-17`:
idempotent, safe across restarts and replicas, run once at boot and then on an interval. It finds
every `ACTIVE` school with an active plan whose next period has started and no invoice exists for it,
and issues one. The unique index from the bug section above is what makes "no invoice exists for it"
enforceable rather than hopeful.

**An anchor.** `CustomerSchool` gains `billingAnchorAt`, set when a plan is assigned — the day of the
month, or of the year, on which the subscription renews. Without it, "monthly" means nothing more
precise than "whenever somebody last clicked".

**Proration is out of scope, deliberately.** Mid-period plan changes prorate in most billing systems,
and that arithmetic is where billing bugs live. Until a customer actually changes plan mid-period,
the honest behaviour is that a plan change takes effect at the next anchor — and the console says so
on the assign-plan control, rather than leaving the operator to guess.

**Suspension interacts with recurrence** and must be decided explicitly rather than by omission: the
scheduler skips any school that is not `ACTIVE`. Otherwise a locked-out customer silently accumulates
a debt they cannot see, having already lost access to the panel where they would have seen it.

### Increment 3 — Plugins on the school bill

Begins with the amendment: correct the comment at `schema.prisma:601` and record the credit decision
under `docs/decisions/`, so the reversal is deliberate and dated rather than discovered later.

**A second checkout route.** Beside today's pay-now order, the customer portal offers "bill to my
school account" when the installation is bound to a `CustomerSchool` with an active plan. Choosing it
creates the `MarketplaceOrder` exactly as now — same lines, same price snapshots, same idempotency —
but with `settlementMode = INVOICE` rather than `IMMEDIATE`.

**Entitlement on approval, with provenance.** An `INVOICE` order mints its entitlements through the
same code path a settled payment uses, so there is one fulfilment implementation rather than two
that drift. The order line records `billedInvoiceLineId`, so an entitlement can always answer which
invoice paid for it.

**Collection.** The next subscription invoice for that school sweeps up every unbilled `INVOICE`
order line as a `PLUGIN` line. A school with no active plan has no next invoice, so for those the
purchase falls back to pay-now — and the portal should say that plainly rather than offering a button
that silently produces nothing.

**Currency is a hard constraint, not a detail.** `issueInvoice` already refuses a currency differing
from `CustomerSchool.currency`, and `ProductPrice` carries its own. A USD-priced plugin cannot join a
KHR invoice without an exchange rate, and an exchange rate on an invoice carries tax and accounting
consequences that belong to a different decision. Version one refuses the mismatch with an explicit
error naming both currencies. It does not silently convert.

**Revocation.** Voiding an invoice that carries `PLUGIN` lines revokes the entitlements those lines
paid for, through the existing `revokeEntitlement`, with the reason recorded. Suspension does *not*
revoke: it already blocks downloads and update fetches at
`installation-entitlement-access.service.ts:33`, and a school that settles its bill should find its
plugins where it left them.

**The fallback, if credit is rejected:** keep `IMMEDIATE` as the only settlement mode and add a
read-only `PLUGIN_MEMO` line kind that carries the period's already-settled orders at zero value. One
document to read, no credit extended, no revocation logic to get wrong.

### Increment 4 — Console and portal

- `SchoolDetail.tsx` renders invoices expanded into their lines, with plugin lines linking to the
  order behind them.
- The customer portal shows the same breakdown, and at checkout states which invoice a plugin will
  land on and when that invoice is due.
- The school's own `/admin/platform-billing` shows lines, since `billingJson` now carries them.
- Every new route is registered in `platform-openapi.ts` with its `x-wattanam-permission`, because
  `platform-authorization-matrix.spec.ts` derives the deny-by-default matrix from that document
  across all nine seeded roles — a route missing from it is never authorization-tested at all.
  Extend the proxy allow-lists in `apps/platform-admin/app/api/platform/[...path]/route.ts` in the
  same change; an unlisted path is unreachable and fails as a silent 404 from the proxy.

### Increment 5 — Publisher revenue attribution

Billing a third party's plugin on your own invoice while writing no `PublisherRevenueEntry` means the
publisher's share exists only in an operator's memory. That is already true of paid orders today, but
Increment 3 pushes more volume down a path that records nothing. Write the revenue entry in the same
transaction that fulfils an order line, under both settlement modes.

## Critical files

- `apps/marketplace-api/prisma/schema.prisma` — `SchoolInvoiceLine`, the period unique index,
  `settlementMode`, `billingAnchorAt`, and the comment at :601 that must be amended
- `apps/marketplace-api/src/school-billing.service.ts` — `issueInvoice`, `issuePlanInvoice`,
  `INVOICE_SELECT`, `customerBilling`, `installationControl`
- `apps/marketplace-api/src/commerce.service.ts` — `createOrder`, `settleProviderPayment`; the
  fulfilment path both settlement modes must share
- `apps/marketplace-api/src/main.ts` — where the recurring scheduler joins `dispatchDueAlerts`
- `apps/marketplace-api/src/platform-openapi.ts` — route and permission registration
- `apps/platform-admin/components/SchoolDetail.tsx`, `app/(operator)/billing-plans/page.tsx`
- `apps/platform-admin/app/api/platform/[...path]/route.ts` — allow-lists
- `backend/src/marketplace/school-billing-control.service.ts`,
  `frontend/app/admin/platform-billing/page.tsx`, `frontend/app/admin/page.tsx` — the school's view
- `docs/architecture/adr/`, `docs/marketplace/platform-admin-interface-checklist.md`

## Verification

Unit tests in the existing marketplace-api convention per increment, plus a live drill on disposable
PostgreSQL 16 with real migrations — the standard every prior work package in this repo has met.

- **Inc. 1** — an invoice with three lines totals correctly; a line set that does not sum to the
  stored total is refused; every pre-existing invoice has exactly one line after migration and an
  unchanged value; the school's own billing page renders the breakdown.
- **Inc. 2** — a monthly school is invoiced once per anchor across repeated scheduler runs, a
  restart, and two concurrent replicas; the unique index refuses a hand-issued duplicate; a suspended
  school accrues nothing; an annual school is invoiced once a year and not twelve times.
- **Inc. 3** — an invoice-settled purchase issues the entitlement immediately and appears as a line
  on the next invoice; the school's own `EntitlementCacheService` fetches and validates it; voiding
  that invoice revokes it; suspending the school does not; a currency mismatch is refused with both
  currencies named in the error.
- **Inc. 4** — Playwright specs against the real stack via `scripts/e2e-stack.mjs`, new rows in
  `02-authorization.spec.ts` for every new permission/route pair, and an axe-core pass on the changed
  screens.
- **Inc. 5** — a fulfilled order line writes exactly one revenue entry under both settlement modes,
  and a refund writes its reversal.

No increment is done without its live drill.

## Explicitly not in this plan

- **Proration** on mid-period plan changes; Increment 2 states the alternative behaviour instead.
- **VAT and tax calculation.** `taxMinor` exists from Increment 1 so tax can be added without
  reissuing history, but nothing computes it.
- **Automatic payment collection.** Money still arrives by bank transfer and is verified by a finance
  operator. Card-on-file and direct debit are a different project with different compliance.
- **Currency conversion**, which is refused explicitly rather than approximated.
- **Plugin subscriptions.** `ProductPrice` is a one-off perpetual licence with a fixed updates
  window. Recurring plugin pricing is a pricing-model change, not a billing-plumbing change.
