# Café POS

Official Wattanam plugin: a point of sale for cafés, restaurants and shops. Plan and decisions:
`architecture/cafe-pos-plugin-plan.md`.

- **Counter:**
  - menu grid by category, with photos;
  - search, or scan a barcode with a USB scanner;
  - sizes and add-ons (milk, sugar level, extra shot), required or optional;
  - item notes;
  - hold an order and recall it;
  - discounts (with permission);
  - customers and points.
- **Paying:**
  - cash in **US dollars and/or riel**; the change is worked out as whole dollars back in dollars, the rest in riel rounded to 100៛;
  - card, bank transfer (ABA, ACLEDA, Wing) with a reference;
  - **KHQR**: the shop's own QR, shown on the counter and the customer display, and the cashier confirms;
  - loyalty points;
  - split across methods.
- **Receipts:** printed through the browser on 58 or 80 mm rolls (or any printer), with:
  - the logo, Khmer and English names, the total in both currencies and the exchange rate;
  - VAT included or added;
  - a bill before paying, with the KHQR.
- **Restaurant:**
  - tables on a floor plan, with live status (free, eating, food ready);
  - dine-in tabs with a service charge;
  - a **Waiter** phone screen (table first, then the order, then Send to kitchen);
  - a **Kitchen Display** per station (bar, kitchen): new → cooking → ready → served, with timers and a chime;
  - a **Customer Display**.
- **Cash shifts:** opening float, pay-ins and pay-outs, closing count; dollars and riel are expected and counted separately; X and Z reports.
- **Back office:**
  - menu (categories, items, sizes, add-ons, photos, CSV import);
  - stock (supplies, deliveries, waste, counts, recipes that take stock when an order is paid and return it on a full refund);
  - customers and points;
  - sales reports by day, hour, item, category, payment method and staff, with refunds and cancellations;
  - a CSV export.
- **Offline:** a sale made while the network is down is kept on the counter device and sent later with the same keys, so it is recorded once.
- **For other plugins:** the read model `daily-sales` v1 (key: business day), with sales, refunds and net per currency.

## Money

- **Units:** all amounts are integers in minor units (US cents, riel). An order is totalled in the shop's base currency (USD or KHR).
- **Exchange rate:** each order keeps the rate it was made with.
- **Prices:** set per item in dollars or riel, and converted at the order's rate.
- **Totals:** the server prices and totals everything; screens only preview.
- **Rules:** `backend/money.js`, which has no database and is tested on its own.

## Permissions

| Permission | Default roles |
|---|---|
| `sell` | Admin, cashier (Receptionist), Accounter |
| `discount`, `void`, `refund`, `tables`, `menu`, `stock`, `configure` | Admin |
| `cash`, `kitchen`, `customers` | Admin, cashier |
| `reports` | Admin, Accounter |

Voids, removed items and refunds always need a reason, and the reports list them.

Needs school core 0.1.36 or newer. The `storage` device is used for the offline queue and the device's register name.

## Credit

The data model and flows follow **FloCafe** (github.com/FreeOpenSourcePOS/FloCafe, MIT licence, © FloCafe Contributors):
- menu, add-on groups and kitchen stations;
- the order and bill life cycle, split payments and cash sessions;
- recipes, refunds and loyalty.

This plugin is a new implementation for the Wattanam plugin runtime (PostgreSQL, integer money, US dollars and riel); no FloCafe source files are copied.
