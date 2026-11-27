'use strict';

// Café POS: a point of sale for cafés, restaurants and shops (architecture/cafe-pos-plugin-plan.md).
// The data model and flows follow FloCafe (MIT, github.com/FreeOpenSourcePOS/FloCafe), re-implemented for the
// Wattanam plugin runtime: PostgreSQL, money in integer minor units, US dollars and riel.
//
//   menu.js     menu, sizes, add-ons, kitchen stations, tables
//   orders.js   orders, payments, refunds, kitchen display, customer display (stock and points on payment)
//   cash.js     cash shifts (dollars and riel counted separately)
//   stock.js    supplies, recipes, stock movements; customers and loyalty points
//   reports.js  sales reports, CSV export, the daily-sales read model
//   money.js    totals, VAT, service charge, two-currency cash and change (no database)

const { ID, PERM } = require('./shared');
const { createSettings } = require('./settings');
const { registerMenu } = require('./menu');
const { registerOrders } = require('./orders');
const { registerCash } = require('./cash');
const { registerStock, registerCustomers } = require('./stock');
const { registerReports } = require('./reports');

const MANAGERS = ['ADMIN', 'SCHOOL_ADMIN'];
const CASHIERS = ['ADMIN', 'SCHOOL_ADMIN', 'RECEPTIONIST'];

module.exports = {
  id: ID,
  health() { return { status: 'ready' }; },
  async activate(context) {
    context.permissions.register([
      { id: PERM.sell, label: 'Sell: take orders and payments, print receipts', description: 'Cashiers and waiters. Every price and total is checked by the server.', roles: [...CASHIERS, 'ACCOUNTER'] },
      { id: PERM.discount, label: 'Give discounts on orders', roles: MANAGERS },
      { id: PERM.void, label: 'Remove items and cancel unpaid orders (with a reason)', roles: MANAGERS },
      { id: PERM.refund, label: 'Refund paid orders (with a reason)', roles: MANAGERS },
      { id: PERM.cash, label: 'Open and close cash shifts, pay-ins and pay-outs', roles: CASHIERS },
      { id: PERM.kitchen, label: 'Use the kitchen display', roles: CASHIERS },
      { id: PERM.tables, label: 'Set up tables and the floor plan', roles: MANAGERS },
      { id: PERM.menu, label: 'Manage the menu (items, sizes, add-ons, prices)', roles: MANAGERS },
      { id: PERM.stock, label: 'Manage supplies, recipes and stock counts', roles: MANAGERS },
      { id: PERM.customers, label: 'Manage customers and loyalty points', roles: CASHIERS },
      { id: PERM.reports, label: 'See sales reports and export them', roles: [...MANAGERS, 'ACCOUNTER'] },
      { id: PERM.configure, label: 'Change POS settings (currencies, exchange rate, VAT, receipt, KHQR, kitchen stations)', roles: MANAGERS },
    ]);
    // The sidebar: the core shows only the entries registered here (plugin.json's list is the declaration).
    const entry = (id, label, routePath, permission) => ({ id, label, href: `/plugins/${ID}/${routePath}`, permission });
    context.navigation.register([
      entry('counter', 'POS Counter', 'counter', PERM.sell),
      entry('waiter', 'Waiter', 'waiter', PERM.sell),
      entry('orders', 'Orders', 'orders', PERM.sell),
      entry('kitchen', 'Kitchen Display', 'kitchen', PERM.kitchen),
      entry('tables', 'Tables', 'tables', PERM.sell),
      entry('display', 'Customer Display', 'display', PERM.sell),
      entry('cash', 'Cash Shifts', 'cash', PERM.cash),
      entry('menu', 'Menu', 'menu', PERM.menu),
      entry('stock', 'Stock', 'stock', PERM.stock),
      entry('customers', 'Customers', 'customers', PERM.customers),
      entry('reports', 'Sales Reports', 'reports', PERM.reports),
      entry('settings', 'POS Settings', 'settings', PERM.configure),
    ]);

    const settings = createSettings(context);
    settings.register();
    registerMenu(context);
    const { publishDay } = registerReports(context, { settings });
    registerOrders(context, { settings, publishDay });
    registerCash(context);
    registerStock(context);
    registerCustomers(context);
    context.logger.log('Café POS activated');
  },
};
