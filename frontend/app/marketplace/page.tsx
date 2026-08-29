'use client';

import { useEffect, useState } from 'react';

type Product = { id: string; name: string; description: string; license: string; paid: boolean; compatible: boolean; publisher: { displayName: string }; prices: Array<{ id: string; currency: string; amountMinor: number }>; versions: Array<{ version: string; requiresCore: string; changelog?: string; sha256?: string }>; ownership?: Array<{ installationId: string; installationLabel?: string; status: string; expiresAt?: string }> };
type Installation = { installationId: string };
type PortalEntitlement = { pluginId: string; status: string; signedToken: unknown; installation: { installationId: string; label?: string }; plugin: { name: string } };

export default function MarketplacePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [entitlements, setEntitlements] = useState<PortalEntitlement[]>([]);
  const [installation, setInstallation] = useState<Installation | null>(null);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [code, setCode] = useState('');
  const [signedIn, setSignedIn] = useState(false); const [busy, setBusy] = useState(''); const [message, setMessage] = useState('');

  async function load() {
    const [core, versionResponse] = await Promise.all([fetch('/api/admin/marketplace/installation', { credentials: 'include' }), fetch('/api/version', { cache: 'no-store' })]);
    if (core.ok) setInstallation(await core.json());
    const versionBody = versionResponse.ok ? await versionResponse.json() : {};
    const coreVersion = typeof versionBody.version === 'string' ? versionBody.version : '1.0.0';
    const catalog = await fetch(`/api/marketplace/catalog?coreVersion=${encodeURIComponent(coreVersion)}`, { cache: 'no-store' });
    if (!catalog.ok) throw new Error((await catalog.json()).error || 'Could not load marketplace');
    const data = await catalog.json(); setProducts(data);
    const owned = await fetch('/api/marketplace/customer/entitlements', { cache: 'no-store' });
    if (owned.ok) { setEntitlements(await owned.json()); setSignedIn(true); } else { setEntitlements([]); setSignedIn(false); }
  }
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);

  async function login() {
    setBusy('login'); setMessage('');
    const response = await fetch('/api/marketplace/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, ...(code ? { code } : {}) }) });
    const body = await response.json(); setBusy('');
    if (!response.ok) return setMessage(body.error || 'Sign-in failed');
    if (body.status === 'mfa_required') return setMessage('Enter your MFA or recovery code, then sign in again.');
    setSignedIn(true); setMessage('Signed in securely.'); await load();
  }

  async function checkout(product: Product) {
    const price = product.prices[0];
    if (!installation?.installationId || !price) return setMessage('Register this school installation and select an available price first.');
    setBusy(product.id); setMessage('');
    const response = await fetch('/api/marketplace/customer/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ installationId: installation.installationId, currency: price.currency, priceIds: [price.id], idempotencyKey: crypto.randomUUID() }) });
    const body = await response.json(); setBusy('');
    if (!response.ok) return setMessage(body.error || 'Checkout failed');
    setMessage(`Order ${body.id} created. Online payment or an authorized manual invoice must settle it before activation.`);
  }

  function exportEntitlement(entitlement: PortalEntitlement) {
    const exportDocument = { schemaVersion: 1, pluginId: entitlement.pluginId, installationId: entitlement.installation.installationId, status: entitlement.status, signedToken: entitlement.signedToken, exportedAt: new Date().toISOString() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(exportDocument, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${entitlement.pluginId}-${entitlement.installation.installationId}-entitlement.json`; anchor.click(); URL.revokeObjectURL(url);
  }

  async function logout() {
    await fetch('/api/marketplace/sessions/revoke', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionToken: 'managed-by-secure-proxy' }) });
    setSignedIn(false); setEntitlements([]); setMessage('Signed out.');
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-10"><div className="mx-auto max-w-6xl space-y-6">
    <header><h1 className="text-3xl font-bold text-slate-900">Wattanam Marketplace</h1><p className="mt-2 text-slate-600">Compatible official plugins, licensing, and secure acquisition for this school.</p></header>
    {message && <div role="status" className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">{message}</div>}
    {!signedIn && <section className="rounded-2xl border bg-white p-6 shadow-sm"><h2 className="font-semibold">Customer sign in</h2><div className="mt-4 grid gap-3 md:grid-cols-3"><input aria-label="Email" className="rounded-lg border px-3 py-2" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} /><input aria-label="Password" type="password" className="rounded-lg border px-3 py-2" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} /><input aria-label="MFA code" className="rounded-lg border px-3 py-2" placeholder="MFA/recovery code (if enabled)" value={code} onChange={e=>setCode(e.target.value)} /></div><button className="btn btn-primary mt-4" disabled={!!busy} onClick={login}>{busy === 'login' ? 'Signing in…' : 'Sign in'}</button></section>}
    {signedIn && <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-semibold">My licences</h2><p className="text-xs text-slate-500">Export a signed token for offline school activation. Refund or expiry never deletes school data.</p></div><button className="btn btn-secondary" onClick={logout}>Sign out</button></div>{entitlements.length === 0 ? <p className="mt-3 text-sm text-slate-500">No licences yet.</p> : <div className="mt-3 space-y-2">{entitlements.map(item=><div key={`${item.pluginId}:${item.installation.installationId}`} className="flex flex-wrap items-center justify-between rounded-lg border p-3 text-sm"><span><strong>{item.plugin.name}</strong> · {item.status.toLowerCase()} · {item.installation.label||item.installation.installationId}</span><button className="btn btn-secondary" onClick={()=>exportEntitlement(item)}>Export offline token</button></div>)}</div>}</section>}
    <section className="grid gap-5 md:grid-cols-2">{products.map(product => <article key={product.id} className="rounded-2xl border bg-white p-6 shadow-sm"><div className="flex justify-between gap-4"><div><h2 className="text-lg font-semibold text-slate-900">{product.name}</h2><p className="text-xs text-slate-500">{product.publisher.displayName} · {product.license}</p></div><span className={`h-fit rounded-full px-2 py-1 text-xs font-semibold ${product.compatible?'bg-emerald-50 text-emerald-700':'bg-red-50 text-red-700'}`}>{product.compatible?'Compatible':'Incompatible'}</span></div><p className="mt-3 text-sm text-slate-600">{product.description}</p><div className="mt-4 text-sm"><strong>{product.paid ? (product.prices[0] ? `${product.prices[0].currency} ${(product.prices[0].amountMinor/100).toFixed(2)}` : 'Price unavailable') : 'Free'}</strong>{product.versions[0] && <p className="mt-1 text-xs text-slate-500">Version {product.versions[0].version} · core {product.versions[0].requiresCore}<br />{product.versions[0].changelog}</p>}</div>{product.ownership?.length ? <div className="mt-4 space-y-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><div>Owned: {product.ownership.map(x=>`${x.installationLabel||x.installationId} (${x.status.toLowerCase()})`).join(', ')}</div>{product.versions[0]?.sha256 && <a className="btn btn-primary inline-flex" href={`/api/marketplace/artifacts/${product.versions[0].sha256}`}>Download verified package</a>}</div> : product.paid ? <button className="btn btn-primary mt-4" disabled={!signedIn || !product.compatible || busy===product.id} onClick={()=>checkout(product)}>{busy===product.id?'Creating order…':'Buy / request invoice'}</button> : <div className="mt-4 text-sm text-indigo-700">Free acquisition is available through the school plugin installer.</div>}</article>)}</section>
  </div></main>;
}
