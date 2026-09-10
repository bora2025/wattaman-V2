'use client';

import Link from 'next/link';
import AuthGuard from '../../../components/AuthGuard';
import PlatformBillingPanel from '../../../components/PlatformBillingPanel';
import Sidebar from '../../../components/Sidebar';
import { adminNav } from '../../../lib/admin-nav';

/**
 * The standalone platform bill. The same panel also renders live inside Licensing; this page stays
 * because it is open to ADMIN as well as SUPER_ADMIN, and because lib/api.ts sends every 402 here
 * while a school is suspended -- it is the one screen guaranteed to load in that state.
 */
export default function PlatformBillingPage() {
  return <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}><div className="min-h-screen bg-slate-50"><Sidebar title="Admin Panel" subtitle="Wattanam" navItems={adminNav} accentColor="indigo" /><main className="p-5 md:ml-72 md:p-8 print:ml-0">
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3 print:hidden"><div><h1 className="text-2xl font-bold text-slate-900">Platform billing</h1><p className="mt-1 text-sm text-slate-600">Wattanam service subscription—not student fee accounting.</p></div><Link className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold" href="/marketplace">Open marketplace account</Link></header>
      <PlatformBillingPanel variant="page" />
    </div>
  </main></div></AuthGuard>;
}
