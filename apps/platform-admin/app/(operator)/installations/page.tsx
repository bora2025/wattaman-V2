'use client';

import CursorTable from '../../../components/CursorTable';

interface InstallationRow {
  id: string;
  installationId: string;
  label: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  account: { id: string; emailMasked: string } | null;
  grant: { scope: string; consentedAt: string; expiresAt: string; revokedAt: string | null } | null;
  _count: { entitlements: number; orders: number };
}

export default function InstallationsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">School installations</h1>
      <p className="text-sm text-slate-600">
        Marketplace-side registration records only. This control plane never reads a school&apos;s own database —
        no students, grades, attendance, or fees are reachable from here.
      </p>
      <CursorTable<InstallationRow>
        path="installations"
        emptyMessage="No school installations have registered yet."
        columns={[
          { header: 'Installation', render: (row) => (
            <div>
              <div className="font-medium">{row.label || 'Unlabelled'}</div>
              <div className="font-mono text-xs text-slate-500">{row.installationId}</div>
            </div>
          ) },
          { header: 'Account', render: (row) => row.account ? row.account.emailMasked : <span className="text-slate-400">unlinked</span> },
          { header: 'Marketplace link', render: (row) => {
            if (!row.grant) return <span className="text-slate-400">none</span>;
            if (row.grant.revokedAt) return <span className="text-amber-700">revoked</span>;
            return <span className="text-emerald-700">active</span>;
          } },
          { header: 'Entitlements', render: (row) => row._count.entitlements },
          { header: 'Orders', render: (row) => row._count.orders },
        ]}
      />
    </div>
  );
}
