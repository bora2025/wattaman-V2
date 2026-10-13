'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { OperatorProfile, platformJson } from '../lib/api';

type Price = {
  id: string; currency: string; amountMinor: number; licensedMajor: number;
  validFrom: string; validUntil: string | null; updatesDays: number; licenseDays: number;
};

type Plugin = {
  id: string; name: string; description: string; license: string; isPaid: boolean; status: string;
  publisher: { slug: string; displayName: string; status: string };
  versions: Array<{ id: string; version: string; requiresCore: string; channel: string; reviewStatus: string; publishedAt: string | null; withdrawnAt: string | null; _count: { downloads: number } }>;
  prices: Price[];
  _count: { entitlements: number; orderLines: number };
};

function money(price: Price) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: price.currency }).format(price.amountMinor / 100);
}

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : 'No end date';
}

export default function PluginManager({ pluginId }: { pluginId: string }) {
  const [plugin, setPlugin] = useState<Plugin | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [currency, setCurrency] = useState('USD');
  const [amount, setAmount] = useState('');
  const [licensedMajor, setLicensedMajor] = useState('1');
  const [licenseDays, setLicenseDays] = useState('365');
  const [updatesDays, setUpdatesDays] = useState('365');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    const [record, profile] = await Promise.all([
      platformJson<Plugin>(`plugins/${encodeURIComponent(pluginId)}`),
      platformJson<OperatorProfile>('me'),
    ]);
    setPlugin(record);
    setCanManage(profile.permissions.includes('plugins.pricing.manage'));
  }, [pluginId]);

  useEffect(() => { load().catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load plugin')); }, [load]);

  const activePrices = useMemo(() => {
    const now = Date.now();
    return plugin?.prices.filter((price) => new Date(price.validFrom).getTime() <= now && (!price.validUntil || new Date(price.validUntil).getTime() > now)) || [];
  }, [plugin]);

  async function savePricing(mode: 'FREE' | 'PAID') {
    setError(''); setMessage(''); setBusy(true);
    try {
      const body = mode === 'FREE'
        ? { mode, internalReason: reason }
        : {
            mode, currency: currency.trim().toUpperCase(), amountMinor: Math.round(Number(amount) * 100),
            licensedMajor: Number(licensedMajor), licenseDays: Number(licenseDays), updatesDays: Number(updatesDays),
            internalReason: reason,
          };
      await platformJson(`plugins/${encodeURIComponent(pluginId)}/pricing`, { method: 'PUT', body: JSON.stringify(body) });
      setMessage(mode === 'FREE' ? 'Plugin is now free. Active paid offers were closed.' : 'Paid offer published successfully.');
      setAmount(''); setReason(''); await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update pricing');
    } finally { setBusy(false); }
  }

  if (!plugin && !error) return <p className="text-sm text-slate-500">Loading plugin…</p>;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><Link href="/plugins" className="text-sm font-medium text-indigo-700 hover:underline">← Plugin catalog</Link><h1 className="mt-2 text-2xl font-bold text-slate-950">{plugin?.name || 'Plugin'}</h1><p className="mt-1 font-mono text-xs text-slate-500">{pluginId}</p></div>
      {plugin && <div className="flex gap-2"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${plugin.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{plugin.status.toLowerCase()}</span><span className={`rounded-full px-3 py-1 text-xs font-semibold ${plugin.isPaid ? 'bg-indigo-100 text-indigo-800' : 'bg-cyan-100 text-cyan-800'}`}>{plugin.isPaid ? 'Paid' : 'Free'}</span></div>}
    </div>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p>}
    {plugin && <>
      <section className="grid gap-4 md:grid-cols-4">
        {[['Pricing', plugin.isPaid ? 'Paid' : 'Free'], ['Active offers', String(activePrices.length)], ['Entitlements', String(plugin._count.entitlements)], ['Orders', String(plugin._count.orderLines)]].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-2 text-2xl font-bold text-slate-950">{value}</div></div>)}
      </section>
      <section className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
        <div className="space-y-6">
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-bold">Catalog details</h2><p className="mt-3 text-sm leading-6 text-slate-600">{plugin.description}</p><dl className="mt-5 grid gap-4 sm:grid-cols-2"><div><dt className="text-xs font-semibold uppercase text-slate-500">Publisher</dt><dd className="mt-1 text-sm">{plugin.publisher.displayName} · {plugin.publisher.slug}</dd></div><div><dt className="text-xs font-semibold uppercase text-slate-500">Licence</dt><dd className="mt-1 text-sm">{plugin.license}</dd></div></dl></article>
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-bold">Price history</h2><p className="mt-1 text-sm text-slate-500">Offers are immutable after use. Repricing closes the previous window and creates a new offer.</p><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-xs uppercase text-slate-500"><tr><th className="py-3">Price</th><th>Major</th><th>Licence</th><th>Updates</th><th>Validity</th></tr></thead><tbody>{plugin.prices.map((price) => <tr key={price.id} className="border-b border-slate-100"><td className="py-3 font-semibold">{money(price)}</td><td>{price.licensedMajor}</td><td>{price.licenseDays} days</td><td>{price.updatesDays} days</td><td>{date(price.validFrom)} → {date(price.validUntil)}</td></tr>)}</tbody></table>{plugin.prices.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No paid offers have been created.</p>}</div></article>
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-bold">Releases</h2><div className="mt-4 space-y-3">{plugin.versions.map((version) => <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"><div><strong>{version.version}</strong><div className="mt-1 text-xs text-slate-500">{version.channel.toLowerCase()} · Core {version.requiresCore} · {version._count.downloads} downloads</div></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{version.reviewStatus.toLowerCase().replaceAll('_', ' ')}</span></div>)}</div></article>
        </div>
        <form className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={(event) => { event.preventDefault(); void savePricing('PAID'); }}>
          <h2 className="text-lg font-bold">Manage availability</h2><p className="mt-1 text-sm text-slate-500">Choose free access or publish a paid licence offer.</p>
          {!canManage && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Your role can view pricing but cannot change it.</p>}
          <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Currency<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 uppercase" maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value)} /></label><label className="text-sm font-medium">Price<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" type="number" min="0.01" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="49.00" /></label><label className="text-sm font-medium">Licensed major version<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" type="number" min="0" required value={licensedMajor} onChange={(event) => setLicensedMajor(event.target.value)} /></label><label className="text-sm font-medium">Licence days<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" type="number" min="1" required value={licenseDays} onChange={(event) => setLicenseDays(event.target.value)} /></label><label className="text-sm font-medium sm:col-span-2">Updates included (days)<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" type="number" min="1" required value={updatesDays} onChange={(event) => setUpdatesDays(event.target.value)} /></label><label className="text-sm font-medium sm:col-span-2">Internal reason<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" minLength={3} required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why this pricing change is being made" /></label></div>
          <div className="mt-5 flex flex-wrap gap-3"><button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50" disabled={!canManage || busy} type="submit">{busy ? 'Saving…' : 'Publish paid offer'}</button><button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50" disabled={!canManage || busy || reason.trim().length < 3} type="button" onClick={() => void savePricing('FREE')}>Make free</button></div>
          <p className="mt-4 text-xs leading-5 text-slate-500">Existing orders and entitlements keep their original commercial terms. Every change is recorded in the platform audit log.</p>
        </form>
      </section>
    </>}
  </div>;
}
