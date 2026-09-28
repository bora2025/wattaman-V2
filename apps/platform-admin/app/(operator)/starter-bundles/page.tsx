'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { OperatorProfile, platformJson } from '../../../lib/api';

interface PluginOption { id: string; name: string; status: string; publisher: { displayName: string } }
interface BundleItem { pluginId: string; versionRange: string; required: boolean; plugin: PluginOption }
interface StarterBundle { id: string; slug: string; name: string; description: string; status: string; items: BundleItem[] }

export default function StarterBundlesPage() {
  const [profile, setProfile] = useState<OperatorProfile | null>(null);
  const [plugins, setPlugins] = useState<PluginOption[]>([]);
  const [bundles, setBundles] = useState<StarterBundle[]>([]);
  const [selected, setSelected] = useState<Record<string, { selected: boolean; versionRange: string; required: boolean }>>({});
  const [slug, setSlug] = useState(''); const [name, setName] = useState(''); const [description, setDescription] = useState('');
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(''); const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [me, pluginPage, bundleList] = await Promise.all([
      platformJson<OperatorProfile>('me'),
      platformJson<{ items: PluginOption[] }>('plugins?status=APPROVED&limit=100'),
      platformJson<StarterBundle[]>('starter-bundles'),
    ]);
    setProfile(me); setPlugins(pluginPage.items); setBundles(bundleList);
  }, []);

  useEffect(() => { load().catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load starter bundles')); }, [load]);
  const can = (permission: string) => !!profile?.permissions.includes(permission);

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy('create'); setError('');
    const items = plugins.filter(plugin => selected[plugin.id]?.selected).map(plugin => ({
      pluginId: plugin.id, versionRange: selected[plugin.id].versionRange || '*', required: selected[plugin.id].required,
    }));
    try {
      if (!items.length) throw new Error('Select at least one plugin.');
      await platformJson('starter-bundles', { method: 'POST', body: JSON.stringify({ slug, name, description, items, internalReason: reason }) });
      setSlug(''); setName(''); setDescription(''); setReason(''); setSelected({}); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create starter bundle'); }
    finally { setBusy(''); }
  }

  async function transition(bundle: StarterBundle, action: 'publish' | 'withdraw') {
    if (!window.confirm(`${action === 'publish' ? 'Publish' : 'Withdraw'} “${bundle.name}”?`)) return;
    setBusy(`${bundle.id}:${action}`); setError('');
    try {
      await platformJson(`starter-bundles/${bundle.id}/${action}`, { method: 'POST', body: JSON.stringify({ internalReason: reason }) });
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : `Could not ${action} bundle`); }
    finally { setBusy(''); }
  }

  return <div className="space-y-5">
    <div><h1 className="text-xl font-bold">Starter bundles</h1><p className="text-sm text-slate-500">Curate recommended plugin collections. Bundles never combine artifacts, prices, entitlements, or lifecycle state.</p></div>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <label className="block text-sm font-medium">Internal reason<input className="pa-input mt-1" value={reason} onChange={event => setReason(event.target.value)} placeholder="Why this catalog change is required" /></label>
    {can('starter_bundles.manage') && <form className="pa-card space-y-4" onSubmit={create}>
      <div><h2 className="font-semibold">Create draft bundle</h2><p className="text-xs text-slate-500">Publishing performs a fresh check for approved Stable artifacts in every version range.</p></div>
      <div className="grid gap-3 md:grid-cols-2"><label className="text-sm font-medium">Name<input className="pa-input mt-1" value={name} onChange={event => { setName(event.target.value); if (!slug) setSlug(event.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')); }} required /></label><label className="text-sm font-medium">Slug<input className="pa-input mt-1 font-mono" value={slug} onChange={event => setSlug(event.target.value)} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label></div>
      <label className="block text-sm font-medium">Description<textarea className="pa-input mt-1 min-h-20" value={description} onChange={event => setDescription(event.target.value)} required /></label>
      <fieldset><legend className="text-sm font-semibold">Plugins, in installation order</legend><div className="mt-2 space-y-2">{plugins.map(plugin => { const value = selected[plugin.id] || { selected: false, versionRange: '*', required: true }; return <div key={plugin.id} className="grid items-center gap-2 rounded-lg border p-3 md:grid-cols-[1fr_12rem_7rem]"><label className="flex gap-2 text-sm"><input type="checkbox" checked={value.selected} onChange={event => setSelected(current => ({ ...current, [plugin.id]: { ...value, selected: event.target.checked } }))} /><span><strong>{plugin.name}</strong><span className="block font-mono text-xs text-slate-500">{plugin.id}</span></span></label><input aria-label={`${plugin.name} version range`} className="pa-input font-mono" disabled={!value.selected} value={value.versionRange} onChange={event => setSelected(current => ({ ...current, [plugin.id]: { ...value, versionRange: event.target.value } }))} /><label className="flex gap-2 text-sm"><input type="checkbox" disabled={!value.selected} checked={value.required} onChange={event => setSelected(current => ({ ...current, [plugin.id]: { ...value, required: event.target.checked } }))} />Required</label></div>; })}</div></fieldset>
      <button className="pa-btn-primary" disabled={!!busy || reason.trim().length < 3}>{busy === 'create' ? 'Creating…' : 'Create draft'}</button>
    </form>}
    <section className="space-y-3"><h2 className="font-semibold">Catalog bundles</h2>{bundles.length === 0 ? <p className="pa-card text-sm text-slate-500">No starter bundles.</p> : bundles.map(bundle => <article className="pa-card" key={bundle.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-semibold">{bundle.name}</h3><span className={`rounded-full px-2 py-1 text-xs font-semibold ${bundle.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{bundle.status.toLowerCase()}</span></div><p className="mt-1 text-sm text-slate-600">{bundle.description}</p><p className="mt-1 font-mono text-xs text-slate-500">{bundle.slug}</p></div><div className="flex gap-2">{bundle.status !== 'APPROVED' && can('starter_bundles.publish') && <button className="pa-btn-primary" disabled={!!busy || reason.trim().length < 3} onClick={() => transition(bundle, 'publish')}>{busy === `${bundle.id}:publish` ? 'Publishing…' : 'Publish'}</button>}{bundle.status === 'APPROVED' && can('starter_bundles.publish') && <button className="pa-btn-secondary" disabled={!!busy || reason.trim().length < 3} onClick={() => transition(bundle, 'withdraw')}>{busy === `${bundle.id}:withdraw` ? 'Withdrawing…' : 'Withdraw'}</button>}</div></div><ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">{bundle.items.map(item => <li key={item.pluginId}>{item.plugin.name} <code>{item.versionRange}</code>{item.required ? '' : ' (optional)'}</li>)}</ol></article>)}</section>
  </div>;
}
