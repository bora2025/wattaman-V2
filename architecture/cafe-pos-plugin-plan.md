# Café POS plugin: plan

Started: 2026-11-26 · Status: **phases 1–4 built** (Café POS 0.1.0, local marketplace; school core branch feat/receipt-printer for USB printing) · Plugin id: `wattanam.cafe-pos`

**Decisions taken (2026-11-26):** cloud hosting with an offline queue; cafés and restaurants; prices per item in USD or KHR, the rate set by the owner; cash, card, transfer, KHQR (the shop's QR, confirmed by the cashier; automatic Bakong confirmation later) and points; browser printing plus USB thermal printers and the cash drawer (core "printer" device); VAT 10 % optional; staff are platform users.

## 1. Goal

A point of sale for cafés, restaurants and small shops that runs as a Wattanam plugin. It covers:
- the counter (fast touch checkout);
- the menu, with sizes and add-ons;
- tables;
- the kitchen display;
- payments in **US dollars and riel**;
- receipts, cash shifts and daily reports.

It is aimed at the organisations that use Organizing Management (shops, cafés).

## 2. What we learned from FloCafe

FloCafe (github.com/FreeOpenSourcePOS/FloCafe) is an MIT-licensed, actively maintained, offline-first café POS: 206 stars, last push 2026-11-25.

**Its architecture:**
- an Electron desktop app;
- an Express API on `:3001`, a kitchen display server on `:3002` (WebSocket) and a waiter "Server App" on `:3003`;
- a local **SQLite** database (better-sqlite3, 104 tables);
- a Next.js 16 / React 19 front end;
- ESC/POS thermal printing over USB and LAN.

**Its main features:**
- counter POS;
- modifiers and add-ons;
- kitchen display (KDS) with prep times;
- floor plan and tables;
- a waiter app on phones;
- split bills and multiple payment types;
- loyalty points;
- supplies, recipes and stock;
- cash shifts and closures;
- refunds;
- expenses;
- signed tax "country packs";
- 58/80 mm receipts and kitchen tickets (KOT);
- a customer-facing display;
- WhatsApp bills;
- Google Drive backup.

**Its core data model** (the part worth copying):

| Area | FloCafe tables |
|---|---|
| Menu | `categories`, `products` (price, cost, sku, barcode, tax, stock), `product_variants`, `addon_groups` (required, min/max), `addons`, `addon_group_product`, `category_addon_groups` |
| Selling | `orders` (type takeaway / dine-in / delivery, status, charges, discount, round-off, totals), `order_items` (price snapshot, variant/modifier selection, status), `order_item_addons`, `held_orders` |
| Paying | `bills` (paid amount, balance, payment status), `bill_items`, `payment_methods`, payment idempotency tables, `refunds`, `loyalty_ledger` |
| Floor and kitchen | `tables` (floor, section, position, status), `kitchen_stations` (categories → station, printer) |
| Cash | `cash_sessions`, `cash_drawer_movements`, `cash_closures`, `expenses` |
| Stock | `supplies`, `supply_movements`, `recipes`, `recipe_items`, `inventory_movements` |

**Order life cycle:** `pending → preparing → ready → served → completed`, or `cancelled`.

**Bill states:** `unpaid`, `partial`, `paid`, `refunded`.

**Permissions:** 60 fine-grained ones in 18 areas, for example `pos.use`, `orders.discount.apply`, `orders.item.void`, `payments.take`, `refunds.initiate`, `cash.shifts.close`, `kitchen.status.update`, `catalog.manage` and `reports.financial.view`.

### What we reuse, and what we don't

FloCafe **cannot be embedded**. Our plugins:
- run in the school core's plugin runtime (Node handlers, per-plugin **PostgreSQL** tables, sandboxed `ui/` screens);
- are signed packages from the marketplace;
- cannot run Electron, SQLite or their own servers and ports.

| Reuse (re-implemented in plugin JavaScript) | Leave out |
|---|---|
| The data model and order/bill life cycle above | Electron, SQLite, Express, its own ports |
| Totals: discount, service and packaging charges, round-off, split payments | WhatsApp through Baileys (an unofficial client, a ToS risk) |
| Tax rules: inclusive or exclusive, per category | PostHog telemetry, Google Drive backup, cloud sync |
| Receipt and kitchen-ticket layout (58/80 mm) | Signed country tax packs (we keep simple configurable rates) |
| The permission list, as a checklist for ours | Its auth, PIN and staff tables (the school core and Organizing Management own people) |
| Idempotency keys for payments and orders (no double charge on a double tap) | |

**Licence:** MIT allows copying code if the copyright notice stays. If we copy any file or function rather than re-implementing it, the plugin ships a `NOTICE` file with FloCafe's MIT notice, and the copied code is marked.

**One correction to apply:** FloCafe stores money as floating-point (`REAL`). We store **integer minor units** (cents for USD, riel for KHR), as Finance does.

## 3. What we add for Cambodia

- **Two currencies:** prices in USD or KHR.
  - The exchange rate is a setting (for example 4,100) and is stored with each sale.
  - Payment can be cash in USD, KHR or both.
  - Change can be given in USD + KHR.
  - Riel amounts are rounded to 100.
- **Payment methods:** cash, card, ABA / ACLEDA / Wing transfers, and **KHQR (Bakong)** (§8, decision 4).
- **Languages:** Khmer and English screens and receipts.
- **VAT:** 10% when the business is VAT-registered, inclusive or exclusive. Other taxes are configurable rates.

## 4. Fit with the platform

| Need | What the platform has | Gap |
|---|---|---|
| Touch screens | Plugin-owned `app` screens (sandboxed) | — |
| Barcode scanner | `scanner` device (camera or USB) | — |
| Kitchen display updates | `realtime.notify` and page `realtime` refresh; polling | Fine for one kitchen; no WebSocket needed |
| Working through a short outage | `storage` device (queue on the device, as Smart Attendance stations do) | Orders are queued and sent later; prices come from a cached menu |
| Fully offline (no internet for hours) | — | Only with the core installed on a box in the café (§8, decision 1) |
| Receipts | Browser printing (80/58 mm print layout through the printer's OS driver) | Enough for phase 1 |
| ESC/POS printing, cash-drawer kick, LAN kitchen printers | — | A new core device, "receipt printer" (WebUSB / Web Serial), in phase 3 |
| Staff | Core users and roles; Organizing Management (employees) | Optional link: cashier = employee |
| Money reports | Finance plugin (student fees today) | Optional later: daily sales as a read model |

## 5. Plugin design

**Identity:**
- `wattanam.cafe-pos`;
- optional dependency on `wattanam.organizing-management` (for staff names and shifts);
- capabilities: routes, database (read, write, transaction), settings, permissions, navigation, ui.pages, realtime.notify, events (durable) and jobs.

**Data**, all with `plugin_wattanam_cafe_pos_` tables:

| Table | Notes |
|---|---|
| `category`, `product`, `product_variant` | Price in minor units plus currency; sku and barcode; tax category; active; sort order; photo |
| `addon_group`, `addon`, `product_addon_group` | Required, min/max; add-on price |
| `dining_table` | Number, seats, floor/section, position, status |
| `kitchen_station` | Name; which categories go there |
| `orders` | Number per business day; type (takeaway, dine-in, delivery); table; status; subtotal, discount, charges, tax, round-off, total; exchange rate; staff; `clientKey` (idempotency) |
| `order_item`, `order_item_addon` | Name and price **snapshot**, quantity, notes; status for the kitchen |
| `payment` | Method, currency, amount, change, reference (KHQR or card), `clientKey` |
| `refund` | Order, amount, reason, approved by |
| `cash_session`, `cash_movement` | Opening float and counted cash per currency; pay-ins and pay-outs; close with the difference |
| `tax_rate` | Name, rate, inclusive/exclusive |
| Phase 3: `supply`, `recipe_item`, `stock_movement`, `customer`, `loyalty_ledger` | |

**Rules (in the plugin, not the screen):**
- **Price snapshots:** prices are copied onto the order when it is made, so later menu changes don't alter it.
- **Totals:** computed on the server and checked again at payment.
- **No double orders or payments:** payments and offline orders carry a `clientKey`, so they are never recorded twice.
- **Undo needs a permission:** voids, discounts above a limit, refunds and reopening a closed shift each need their own permission and are logged.
- **Shift close:** the business day closes with the shift. A Z-report records what was counted against what was expected, per currency.

**Permissions** (default roles to be decided with you):

| Permission | Who |
|---|---|
| `pos.sell` | Take orders and payments (counter, waiter) |
| `pos.discount` | Give discounts |
| `pos.void` | Void items and orders |
| `pos.refund` | Refunds |
| `pos.cash` | Open and close shifts, pay-ins and pay-outs |
| `pos.kitchen` | Use the kitchen display |
| `pos.tables` | Manage the floor plan |
| `pos.menu` | Manage the menu |
| `pos.reports` | Sales reports |
| `pos.configure` | Settings (currencies, rate, taxes, receipt) |

**Screens** (plugin `ui/`; the sidebar registers them in code):
1. **Counter**: the menu grid by category, search or barcode, cart, add-ons, notes, discount, hold or recall, pay (split, two currencies, change), print the receipt, and the offline queue.
2. **Orders**: today's orders, reprint, void or refund (with permission).
3. **Kitchen display**: tickets by station, with *new → preparing → ready* by tap, timers and sound.
4. **Tables**: the floor plan with each table's status and current order (phase 2).
5. **Waiter**: a phone screen for taking table orders (phase 2).
6. **Menu**: categories, products, variants, add-on groups, photos, CSV import.
7. **Cash shifts**: open, pay-ins and pay-outs, close with a count per currency, Z-report.
8. **Reports**: sales by day, hour, product, category, payment method and staff; voids and refunds; export.
9. **Settings**: currencies and rate, taxes, receipt header and footer (logo, Khmer/English), printers, order types.

## 6. Phases

| Phase | Contents | Estimate |
|---|---|---|
| **0. Decisions** | §8; a sample menu and receipt from a real café | 1 week |
| **1. Counter MVP** | Menu (categories, products, variants, add-ons); Counter; takeaway orders; cash, card and transfer payments, split, USD/KHR with change; browser receipt 58/80 mm; Orders (reprint, void, refund with permission); cash shifts and Z-report; daily sales report; offline queue | 3–4 weeks |
| **2. Restaurant** | Tables and floor plan; dine-in; kitchen stations; kitchen display (realtime); waiter phone screen; customer display; service charge | 2–3 weeks |
| **3. Hardware and stock** | Core "receipt printer" device (ESC/POS, cash drawer, kitchen printers); supplies, recipes and stock deduction; customers and loyalty; KHQR (Bakong) dynamic QR with payment check | 3–5 weeks |
| **4. Links** | Organizing Management (cashier = employee, staff shifts); a daily sales read model for Finance or reporting; menu photos through storage | 1–2 weeks |

**Testing at each phase:**
- plugin tests (totals and rounding in both currencies, idempotency, permissions);
- real-database checks;
- browser tests of the counter on a tablet and a phone;
- one pilot café before the marketplace.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Internet drops at the counter | Offline queue with a cached menu; the on-site core box option for cafés with poor internet |
| Slow counter on a cloud server | Menu cached on the device; one request per order and per payment; measure in the pilot |
| Wrong change or rounding in two currencies | Integer minor units; one tested totals module; the rate stored with each sale |
| Staff fraud (voids, discounts, drawer) | Separate permissions, a reason for every void and refund, shift counts, an audit log, reports by staff |
| Printer variety | Browser printing first; ESC/POS profiles later (FloCafe's printer database is MIT and can be reused) |
| Copied code without its notice | A `NOTICE` file; copied parts marked |

## 8. Decisions for you

1. **Hosting:** cafés on your cloud (needs internet, with a short offline queue), or a core box in the café for full offline? Or both, chosen per customer.
2. **Business types first:** cafés only, or restaurants with tables and kitchen from the start (this moves phase 2 earlier)?
3. **Currencies:** price in USD, KHR or either per product? Is the default exchange rate set daily by the owner?
4. **Payments:** which ones at launch (cash, card terminal reference, ABA/ACLEDA/Wing transfer reference)? Do you want **KHQR (Bakong)** with automatic payment confirmation? That needs a merchant account and the Bakong API.
5. **Printers:** which receipt printers do your customers use (USB or LAN, 58 or 80 mm)? Cash drawer?
6. **Tax:** VAT 10% for registered businesses; any other taxes to show on receipts?
7. **Staff:** link cashiers to Organizing Management employees, or use the core's users only?
8. **Marketplace:** name, price, and whether it is a separate product from the school plugins.
