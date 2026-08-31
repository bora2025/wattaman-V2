'use client';

import { useEffect, useState } from 'react';
import { platformJson } from '../../../lib/api';

interface Role {
  id: string; key: string; displayName: string; description: string;
  permissions: Array<{ permission: { key: string; description: string } }>;
  _count: { operatorRoles: number };
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]); const [error, setError] = useState('');
  useEffect(() => { platformJson<Role[]>('roles').then(setRoles).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load roles')); }, []);
  return <div className="space-y-4"><div><h1 className="text-xl font-bold">Platform roles</h1><p className="text-sm text-slate-500">Read-only view of seeded roles and effective permission definitions.</p></div>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <div className="grid gap-4 lg:grid-cols-2">{roles.map(role => <article key={role.id} className="rounded-xl border bg-white p-5"><div className="flex justify-between gap-4"><div><h2 className="font-semibold">{role.displayName}</h2><div className="font-mono text-xs text-slate-500">{role.key}</div></div><span className="text-xs text-slate-500">{role._count.operatorRoles} grants</span></div><p className="mt-3 text-sm text-slate-600">{role.description}</p><ul className="mt-3 space-y-1 text-xs text-slate-600">{role.permissions.map(item => <li key={item.permission.key}><span className="font-mono text-slate-800">{item.permission.key}</span> — {item.permission.description}</li>)}</ul></article>)}</div>
  </div>;
}
