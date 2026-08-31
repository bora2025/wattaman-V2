'use client';

import CursorTable from '../../../components/CursorTable';
import Link from 'next/link';

interface OrderRow {
  id: string; status: string; currency: string; totalMinor: number; createdAt: string;
  account: { displayName: string; email: string }; installation: { installationId: string; label: string | null };
  _count: { lines: number; payments: number; refunds: number };
}

function amount(minor: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minor / 100);
}

export default function OrdersPage() {
  return <div className="space-y-4"><h1 className="text-xl font-bold">Orders</h1>
    <CursorTable<OrderRow> path="orders" emptyMessage="No orders found." filters={[
      { key: 'status', label: 'Status', type: 'select', options: ['PENDING', 'PAID', 'CANCELLED', 'REFUNDED'].map(value => ({ value, label: value.toLowerCase() })) },
      { key: 'currency', label: 'Currency', placeholder: 'USD' },
    ]} columns={[
      { header: 'Order', render: row => <Link className="font-mono text-xs text-indigo-700 hover:underline" href={`/orders/${row.id}`}>{row.id}</Link> },
      { header: 'Customer', render: row => <div>{row.account.displayName}<div className="text-xs text-slate-500">{row.account.email}</div></div> },
      { header: 'School', render: row => row.installation.label || row.installation.installationId },
      { header: 'Status', render: row => row.status.toLowerCase() },
      { header: 'Total', render: row => amount(row.totalMinor, row.currency) },
      { header: 'Payments / refunds', render: row => `${row._count.payments} / ${row._count.refunds}` },
    ]} />
  </div>;
}
