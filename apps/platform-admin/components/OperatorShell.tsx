'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { OperatorProfile, platformFetch, platformJson } from '../lib/api';

/** Navigation is filtered by the operator's real permission set from /platform/v1/me. This is a
 * usability affordance only — the API authorizes every request independently (plan §7: "UI hiding
 * is not authorization"), so a hand-typed URL to a page they lack permission for still fails. */
const NAV: Array<{ href: string; label: string; permission: string }> = [
  { href: '/dashboard', label: 'Dashboard', permission: 'platform.dashboard.read' },
  { href: '/operators', label: 'Operators', permission: 'operators.read' },
  { href: '/customers', label: 'Customers', permission: 'customers.read' },
  { href: '/account-requests', label: 'Account requests', permission: 'customers.read' },
  { href: '/schools', label: 'Customer schools', permission: 'schools.read' },
  { href: '/billing-plans', label: 'School billing plans', permission: 'school_billing.read' },
  { href: '/schools/provisioning', label: 'School provisioning', permission: 'schools.read' },
  { href: '/installations', label: 'School installations', permission: 'schools.read' },
  { href: '/publishers', label: 'Publishers', permission: 'publishers.read' },
  { href: '/plugins', label: 'Plugins', permission: 'plugins.read' },
  { href: '/starter-bundles', label: 'Starter bundles', permission: 'starter_bundles.read' },
  { href: '/plugin-requests', label: 'School plugin requests', permission: 'plugin_requests.read' },
  { href: '/submissions', label: 'Submissions', permission: 'plugins.review' },
  { href: '/orders', label: 'Orders', permission: 'orders.read' },
  { href: '/entitlements', label: 'Entitlements', permission: 'orders.read' },
  { href: '/advisories', label: 'Advisories', permission: 'advisories.read' },
  { href: '/operations', label: 'Operations', permission: 'operations.read' },
  { href: '/exports', label: 'Exports', permission: 'audit.export' },
  { href: '/audit', label: 'Audit', permission: 'audit.read' },
];

export default function OperatorShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<OperatorProfile | null>(null);

  useEffect(() => {
    platformJson<OperatorProfile>('me')
      .then(setProfile)
      .catch(() => router.replace('/login'));
  }, [router]);

  async function signOut() {
    await platformFetch('auth/sessions/revoke', { method: 'POST', body: '{}' }).catch(() => undefined);
    router.replace('/login');
  }

  if (!profile) {
    return <main className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</main>;
  }

  const permitted = NAV.filter((entry) => profile.permissions.includes(entry.permission));

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-white p-5">
        <div className="text-sm font-bold">Wattanam Platform</div>
        <div className="mt-1 text-xs text-slate-500">Operator control plane</div>
        <nav className="mt-6 space-y-1">
          {permitted.map((entry) => (
            <Link key={entry.href} href={entry.href}
                  className={`block rounded-lg px-3 py-2 text-sm ${pathname === entry.href || pathname.startsWith(`${entry.href}/`) ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
              {entry.label}
            </Link>
          ))}
          {permitted.length === 0 && (
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
              No permissions are granted to this operator yet. Ask a Platform Owner to assign a role.
            </p>
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="text-sm">
            <span className="font-medium">{profile.operator.displayName}</span>
            <span className="ml-2 text-slate-500">{profile.operator.email}</span>
            <span className="ml-2 text-xs text-slate-500">
              {profile.roles.map((role) => role.displayName).join(', ') || 'no roles'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Outside the permission-filtered navigation on purpose: changing your own password
                is not a granted capability, it is something every operator must always be able
                to do — including one with no roles at all. */}
            <Link className="pa-btn-secondary" href="/account">Your account</Link>
            <button className="pa-btn-secondary" onClick={signOut}>Sign out</button>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
