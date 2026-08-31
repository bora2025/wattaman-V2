'use client';

import CursorTable from '../../../components/CursorTable';
import Link from 'next/link';

interface CustomerRow {
  id: string; displayName: string; email: string; emailVerifiedAt: string | null;
  mfaEnabled: boolean; createdAt: string; _count: { installations: number; orders: number };
}

export default function CustomersPage() {
  return <div className="space-y-4">
    <div><h1 className="text-xl font-bold">Customers</h1><p className="text-sm text-slate-500">Marketplace accounts only; no school business data is available here.</p></div>
    <CursorTable<CustomerRow> path="customers" emptyMessage="No customer accounts found." filters={[
      { key: 'email', label: 'Email contains', placeholder: 'name@example.com' },
      { key: 'verified', label: 'Email verification', type: 'select', options: [{ value: 'true', label: 'Verified' }, { value: 'false', label: 'Not verified' }] },
    ]} columns={[
      { header: 'Customer', render: row => <div><Link className="font-medium text-indigo-700 hover:underline" href={`/customers/${row.id}`}>{row.displayName}</Link><div className="text-xs text-slate-500">{row.email}</div></div> },
      { header: 'Verified', render: row => row.emailVerifiedAt ? 'Yes' : 'No' },
      { header: 'MFA', render: row => row.mfaEnabled ? 'Enabled' : 'Not enabled' },
      { header: 'Schools', render: row => row._count.installations },
      { header: 'Orders', render: row => row._count.orders },
      { header: 'Created', render: row => new Date(row.createdAt).toLocaleDateString() },
    ]} />
  </div>;
}
