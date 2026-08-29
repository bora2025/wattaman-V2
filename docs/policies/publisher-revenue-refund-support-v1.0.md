# Publisher Revenue, Refund, and Support Rules — Version 1.0

Status: engineering publication candidate. Rates, tax treatment, payment timing, and refund eligibility require finance/legal approval before taking effect.

Customer charges are recorded in integer minor units. Each paid order line creates an append-only publisher sale allocation. Refunds and disputes create reversing entries; they never rewrite the sale. Marketplace fees, taxes/withholding, corrections, statements, and payouts are separate ledger entries or retained totals. Corrections and payouts require different requesters and approvers, and payout execution is separated from approval.

Statements identify period, currency, gross, fee, tax, net, and immutable source entries. A payout cannot include an entry twice and must reconcile exactly to its selected net entries. Publishers remain responsible for accurate tax and bank information. Customer support starts with the owner identified in the support matrix; security and platform incidents escalate to Wattanam under the published response targets.
