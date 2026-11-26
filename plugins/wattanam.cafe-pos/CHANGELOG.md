# Changelog

## 0.1.5
- Customer Display: while nobody is at the till it shows the **menu board**: every category with its items' photos, Khmer and English names, sizes and prices (with the riel or dollar equivalent), the shop's logo and the exchange rate; a long menu scrolls slowly by itself. It switches to the order as soon as the counter rings one up (the items now with their photos), and back to the menu after the thank-you. Menu changes appear within five minutes.
- POS Settings: "Customer display shows the menu with photos when idle" (on by default).

## 0.1.4
- Customer Display, Kitchen Display, Counter and Waiter can be shown on their own screen: “🖥️ Show on a screen” opens the page alone (no sidebar or header) on the monitor you choose (Chrome and Edge), full screen after one tap. A dedicated tablet or PC opens the page with ?screen=1 (or a browser in kiosk mode). Needs the school core's screen mode.
- The Kitchen Display fills the screen.

## 0.1.3
- No cash shift: the counter says so when it opens, and a tap on “No cash shift — open” opens one there (float in dollars and riel; needs the Cash shifts permission). Paying cash without a shift asks to open one, then takes the payment by itself; or “Pay another way” switches to card. A shift closed on another device is handled the same way.
- Offline cash sales wait on the device until a shift is open (they no longer arrive unpaid).
- Orders: a cash refund without a shift explains to open one or refund another way.

## 0.1.2
- Sounds: item added, paid (and the cash drawer's ka-ching), an error, kept offline, sent to the kitchen, a new kitchen ticket, cooking, ready, served, a table's food ready, cash shift opened and closed, cash in/out, cancelled or refunded, and thank-you on the customer display. Made in the browser (no sound files).
- POS Settings: “Sounds” on or off for the shop, and a Try button that plays each one; the Kitchen Display keeps its own sound switch per screen.

## 0.1.1
- Fix: new orders failed on the school core (the day's order number was read in a way the core refuses), so sales stayed in the counter's offline queue and never reached the kitchen, the customer display or the reports. Sales kept on a counter are sent automatically after the update.
- Only real network trouble keeps a sale on the device; a server error is shown to the cashier.

## 0.1.0
First release, all four phases of `architecture/cafe-pos-plugin-plan.md`:
- **Counter:**
  - menu with sizes, add-ons and photos;
  - US dollar and riel prices;
  - hold and recall orders, discounts, customers;
  - cash in dollars and riel with change worked out; card, transfer, KHQR and points; split payments;
  - receipts and bills (58/80 mm);
  - an offline queue.
- **Restaurant:** tables and floor plan, dine-in tabs with service charge, Waiter screen, Kitchen Display per station, Customer Display.
- **Cash shifts** with dollar and riel counts, X and Z reports.
- **Stock:** supplies, recipes (taken on payment, returned on refund), deliveries, waste and counts.
- **Customers and loyalty points.**
- **Sales reports**, CSV export, and the `daily-sales` read model.
- **Menu import** from CSV.
