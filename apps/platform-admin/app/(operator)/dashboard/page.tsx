'use client';

import { useEffect, useState } from 'react';
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

  const groups: Array<{ title: string; stats: Array<{ label: string; value: number }> }> = [
    { title: 'Catalog', stats: [
      { label: 'Plugins', value: data.catalog.plugins },
      { label: 'Published versions', value: data.catalog.publishedVersions },
      { label: 'Publishers', value: data.catalog.publishers },
    ] },
    { title: 'Schools', stats: [
      { label: 'Registered installations', value: data.schools.installations },
      { label: 'Marketplace-linked', value: data.schools.linkedInstallations },
      { label: 'Active entitlements', value: data.schools.activeEntitlements },
    ] },
    { title: 'Commerce & security', stats: [
      { label: 'Orders awaiting settlement', value: data.commerce.pendingOrders },
      { label: 'Open advisories', value: data.security.openAdvisories },
      { label: 'Active operators', value: data.platform.activeOperators },
    ] },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Dashboard</h1>
      {groups.map((group) => (
        <section key={group.title}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{group.title}</h2>
          <div className="mt-2 grid gap-4 sm:grid-cols-3">
            {group.stats.map((stat) => (
              <div key={stat.label} className="pa-card">
                <div className="text-2xl font-bold tabular-nums">{stat.value}</div>
                <div className="mt-1 text-sm text-slate-600">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
