'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import AuthGuard from '../../../../components/AuthGuard';
import Sidebar from '../../../../components/Sidebar';
import { adminNav } from '../../../../lib/admin-nav';
import { apiFetch } from '../../../../lib/api';

export default function PluginPageHost() {
  const params = useParams<{ pluginId: string; path?: string[] }>();
  const pluginId = decodeURIComponent(params.pluginId || '');
  const routePath = (params.path || ['settings']).map(decodeURIComponent).join('/');
  const endpoint = useMemo(() => `/api/plugin-api/${encodeURIComponent(pluginId)}/${routePath.split('/').map(encodeURIComponent).join('/')}`, [pluginId, routePath]);
  const [value, setValue] = useState<unknown>(null);
  const [text, setText] = useState('');
  const [label, setLabel] = useState(pluginId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    const [response, extensionsResponse] = await Promise.all([apiFetch(endpoint), apiFetch('/api/plugin-api/extensions')]);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || `Plugin page failed (${response.status})`);
    if (extensionsResponse.ok) {
      const extensions = await extensionsResponse.json();
      const page = extensions.pages?.find((entry: any) => entry.pluginId === pluginId && entry.routePath === routePath);
      if (!page) throw new Error('This plugin page is not registered by an active plugin.');
      if (page.kind !== 'json-settings') throw new Error(`Unsupported plugin page kind: ${page.kind}`);
      if (page.title) setLabel(page.title);
      const current = extensions.navigation?.find((entry: any) => entry.pluginId === pluginId && entry.href.endsWith(`/${routePath}`));
      if (current?.label) setLabel(current.label);
    }
    setValue(result);
    setText(JSON.stringify(result, null, 2));
  }

  useEffect(() => { load().catch((cause) => setError(cause instanceof Error ? cause.message : 'Plugin page failed')); }, [endpoint]);

  async function save() {
    setBusy(true); setError('');
    try {
      const body = JSON.parse(text);
      const response = await apiFetch(endpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || `Plugin settings update failed (${response.status})`);
      setValue(result); setText(JSON.stringify(result, null, 2));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Plugin settings update failed'); }
    finally { setBusy(false); }
  }

  return (
    <AuthGuard allowedRoles={['SUPER_ADMIN']}>
      <div className="page-shell">
        <Sidebar title="Admin Panel" subtitle="Wattanam" navItems={adminNav} accentColor="indigo" />
        <div className="page-content">
          <div className="h-14 lg:hidden" />
          <div className="page-header"><h1 className="text-2xl font-bold text-slate-800">{label}</h1><p className="mt-1 font-mono text-xs text-slate-500">{pluginId} · {routePath}</p></div>
          <div className="page-body">
            <section className="card max-w-3xl p-6">
              <h2 className="font-semibold text-slate-800">Plugin settings</h2>
              <p className="mt-1 text-sm text-slate-500">This generic host sends JSON only to the plugin&apos;s namespaced, authenticated core route. Plugin browser scripts are not injected into Wattanam.</p>
              {error && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
              <textarea aria-label="Plugin settings JSON" className="mt-4 min-h-72 w-full rounded-lg border border-slate-300 p-3 font-mono text-sm" value={text} onChange={(event) => setText(event.target.value)} disabled={value === null || busy} />
              <div className="mt-4 flex gap-3"><button className="btn btn-primary" onClick={save} disabled={value === null || busy}>{busy ? 'Saving…' : 'Save settings'}</button><button className="btn btn-secondary" onClick={() => load().catch((cause) => setError(cause.message))} disabled={busy}>Reload</button></div>
            </section>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
