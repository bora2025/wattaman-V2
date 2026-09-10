# Decision: a school may buy a plugin on its invoice, on credit

Date: 2026-09-10
Status: accepted
Supersedes: the assertion in `apps/marketplace-api/prisma/schema.prisma` that school invoices
"are separate from plugin orders" (amended in the invoice-lines change).

## What was true before

Two money systems ran side by side and never met.

A plugin was bought outright. `commerce.service.ts` mints the entitlement *inside* the payment
transaction, so nothing ever granted a paid plugin before money had settled. A school subscription,
by contrast, is invoiced net-14 and settled later by bank transfer that a finance operator verifies
by hand.

## The problem

Putting a plugin on a school invoice makes those two facts incompatible. An invoice is not money;
it is a promise of money in fourteen days. So either:

- the school waits out the invoice before receiving a plugin it has agreed to buy and we have
  already approved, or
- the entitlement is granted when the purchase is approved, which is credit.

## The decision

**Grant on credit.** An `INVOICE` order mints its entitlement at approval and the charge appears on
the school's next subscription invoice.

The reasoning is not that credit risk is absent, but that it is already dwarfed by a lever we hold
anyway: an unpaid platform invoice suspends the entire school through `installationControl`. A
customer who will not pay loses their whole school, not merely one plugin. Against that, one
entitlement is small collateral, and the alternative is a worse product — a paying customer sitting
on their hands for two weeks waiting for software we have already said yes to.

## What bounds it

- **Only a school with an active plan may buy on invoice.** No plan means no next invoice, so there
  is nothing to bill to. Those purchases stay pay-first, and the portal says so rather than offering
  a button that produces nothing.
- **Only in the school's own billing currency.** `ProductPrice` carries its own currency and
  `issueInvoice` refuses one that differs from the school's. A USD plugin cannot join a KHR invoice
  without an exchange rate, and an exchange rate on an invoice has tax and accounting consequences
  that belong to a different decision. The mismatch is refused with both currencies named, never
  silently converted.
- **Voiding the invoice revokes what it paid for.** The link is recorded on the invoice line, so an
  entitlement can always answer which invoice bought it.
- **Suspension does not revoke.** Downloads and update fetches are already blocked while a school is
  suspended; a school that settles its bill should find its plugins where it left them.

## What was rejected

Keeping plugins pay-first and listing already-settled orders on the invoice as a zero-value memo.
It extends no credit and needs no revocation logic, and it was written up as the fallback in the
plan. It was rejected because it solves only the documentation problem — one page to read — while
leaving the actual friction, which is that a school that wants to pay by bank transfer like it pays
for everything else cannot buy a plugin at all.

## What this does not change

The control plane still cannot install or activate a plugin inside a school. Issuing an entitlement
makes a plugin *available*; the school decides what to run. That prohibition, in
`docs/marketplace/platform-admin-interface-plan.md` §2, survives intact.
