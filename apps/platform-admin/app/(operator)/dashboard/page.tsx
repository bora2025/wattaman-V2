'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { platformJson } from '../../../lib/api';

interface DashboardData {
  catalog: { plugins: number; publishedVersions: number; publishers: number };
  schools: { installations: number; linkedInstallations: number; activeEntitlements: number };
  commerce: { pendingOrders: number };
  security: { openAdvisories: number };
  platform: { activeOperators: number };
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    platformJson<DashboardData>('dashboard').then(setData).catch((cause) => setError(cause.message));
  }, []);

  if (error) return <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;

  const linkedRate = data.schools.installations ? Math.round(data.schools.linkedInstallations / data.schools.installations * 100) : 0;
  const needsAttention = data.commerce.pendingOrders + data.security.openAdvisories;
  const stats = [
    { label: 'Customer schools', value: data.schools.installations, note: `${data.schools.linkedInstallations} linked to Marketplace`, href: '/schools', dot: 'bg-indigo-500' },
    { label: 'Catalog plugins', value: data.catalog.plugins, note: `${data.catalog.publishedVersions} published releases`, href: '/plugins', dot: 'bg-violet-500' },
    { label: 'Active licences', value: data.schools.activeEntitlements, note: 'Across all school installations', href: '/entitlements', dot: 'bg-emerald-500' },
    { label: 'Needs attention', value: needsAttention, note: `${data.commerce.pendingOrders} orders · ${data.security.openAdvisories} advisories`, href: data.commerce.pendingOrders ? '/orders' : '/advisories', dot: needsAttention ? 'bg-amber-500' : 'bg-slate-400' },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-indigo-600">Platform overview</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Operations dashboard</h1><p className="mt-2 text-sm text-slate-600">Monitor schools, marketplace activity, billing, and platform risk from one place.</p></div><div className="flex gap-2"><Link className="pa-btn-secondary" href="/schools/provisioning">Provision school</Link><Link className="pa-btn-primary" href="/plugins">Manage marketplace</Link></div></header>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map((stat) => <Link key={stat.label} href={stat.href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"><div className="flex items-center justify-between"><span className={`h-2.5 w-2.5 rounded-full ${stat.dot}`} /><span className="text-slate-300 transition group-hover:translate-x-1 group-hover:text-indigo-500">→</span></div><div className="mt-5 text-3xl font-bold tabular-nums text-slate-950">{stat.value}</div><div className="mt-1 font-semibold text-slate-800">{stat.label}</div><p className="mt-2 text-xs text-slate-500">{stat.note}</p></Link>)}</section>
      <div className="grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
        <section className="pa-card"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">School network</h2><p className="mt-1 text-sm text-slate-500">Marketplace connection coverage for registered installations.</p></div><strong className="text-2xl text-indigo-700">{linkedRate}%</strong></div><div className="mt-6 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-cyan-500" style={{ width: `${linkedRate}%` }} /></div><div className="mt-4 grid grid-cols-3 gap-3 text-center"><Metric value={data.schools.installations} label="Registered" /><Metric value={data.schools.linkedInstallations} label="Linked" /><Metric value={Math.max(0, data.schools.installations - data.schools.linkedInstallations)} label="To connect" /></div></section>
        <section className="pa-card"><h2 className="text-lg font-bold">Quick actions</h2><div className="mt-4 grid gap-2"><QuickLink href="/billing-plans" title="Billing plans" text="Prices, cycles, and payment accounts" /><QuickLink href="/orders" title="Review orders" text={`${data.commerce.pendingOrders} awaiting settlement`} /><QuickLink href="/publishers" title="Publishers" text={`${data.catalog.publishers} registered publishers`} /><QuickLink href="/operators" title="Platform team" text={`${data.platform.activeOperators} active operators`} /></div></section>
      </div>
    </div>
  );
}

function Metric({ value, label }: { value: number; label: string }) { return <div className="rounded-xl bg-slate-50 p-3"><div className="text-xl font-bold tabular-nums">{value}</div><div className="mt-1 text-xs text-slate-500">{label}</div></div>; }
function QuickLink({ href, title, text }: { href: string; title: string; text: string }) { return <Link href={href} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 transition hover:border-indigo-200 hover:bg-indigo-50/40"><div><div className="text-sm font-semibold text-slate-900">{title}</div><div className="text-xs text-slate-500">{text}</div></div><span className="text-indigo-600">→</span></Link>; }
