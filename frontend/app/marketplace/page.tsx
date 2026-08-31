'use client';

import { useEffect, useState } from 'react';
import { formatMoney } from '../../lib/formatMoney';

type Product = { id: string; name: string; description: string; license: string; paid: boolean; compatible: boolean; publisher: { displayName: string }; prices: Array<{ id: string; currency: string; amountMinor: number }>; versions: Array<{ version: string; requiresCore: string; changelog?: string; sha256?: string }>; ownership?: Array<{ installationId: string; installationLabel?: string; status: string; expiresAt?: string }> };
type Installation = { installationId: string };
type PortalEntitlement = { pluginId: string; status: string; signedToken: unknown; installation: { installationId: string; label?: string }; plugin: { name: string } };
type PluginRequest = { id: string; type: string; status: string; submittedAt: string; slaDueAt: string; plugin?: { id: string; name: string }; installation: { installationId: string; label?: string } };

export default function MarketplacePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [entitlements, setEntitlements] = useState<PortalEntitlement[]>([]);
  const [pluginRequests, setPluginRequests] = useState<PluginRequest[]>([]);
  const [installation, setInstallation] = useState<Installation | null>(null);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [code, setCode] = useState('');
  const [signedIn, setSignedIn] = useState(false); const [busy, setBusy] = useState(''); const [message, setMessage] = useState('');
  const [requestType, setRequestType] = useState('FREE_APPROVAL'); const [requestPluginId, setRequestPluginId] = useState('');
  const [requestReason, setRequestReason] = useState(''); const [featureDescription, setFeatureDescription] = useState('');
  const [requestResponses, setRequestResponses] = useState<Record<string, string>>({});

  async function load() {
    const [core, versionResponse] = await Promise.all([fetch('/api/admin/marketplace/installation', { credentials: 'include' }), fetch('/api/version', { cache: 'no-store' })]);
    if (core.ok) setInstallation(await core.json());
    const versionBody = versionResponse.ok ? await versionResponse.json() : {};
    const coreVersion = typeof versionBody.version === 'string' ? versionBody.version : '1.0.0';
    const catalog = await fetch(`/api/marketplace/catalog?coreVersion=${encodeURIComponent(coreVersion)}`, { cache: 'no-store' });
    if (!catalog.ok) throw new Error((await catalog.json()).error || 'Could not load marketplace');
    const data = await catalog.json(); setProducts(data);
    const owned = await fetch('/api/marketplace/customer/entitlements', { cache: 'no-store' });
    if (owned.ok) {
      setEntitlements(await owned.json()); setSignedIn(true);
      const requests = await fetch('/api/marketplace/customer/plugin-requests', { cache: 'no-store' });
      setPluginRequests(requests.ok ? await requests.json() : []);
    } else { setEntitlements([]); setPluginRequests([]); setSignedIn(false); }
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

  async function submitPluginRequest() {
    if (!installation?.installationId) return setMessage('Register and link this school installation first.');
    if (requestReason.trim().length < 10) return setMessage('Explain why the school needs this plugin (at least 10 characters).');
    if (requestType !== 'FEATURE_REQUEST' && !requestPluginId) return setMessage('Select a plugin.');
    if (requestType === 'FEATURE_REQUEST' && featureDescription.trim().length < 10) return setMessage('Describe the requested feature.');
    setBusy('plugin-request'); setMessage('');
    const response = await fetch('/api/marketplace/customer/plugin-requests', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ installationId: installation.installationId, type: requestType, justification: requestReason, ...(requestType === 'FEATURE_REQUEST' ? { featureDescription } : { pluginId: requestPluginId }) }),
    });
    const body = await response.json(); setBusy('');
    if (!response.ok) return setMessage(body.error || 'Plugin request failed');
    setRequestReason(''); setFeatureDescription(''); setMessage(`Request ${body.id} submitted.`); await load();
  }

  async function respondToPluginRequest(requestId: string) {
    const responseText = requestResponses[requestId]?.trim();
    if (!responseText) return setMessage('Enter the requested information.');
    setBusy(`respond:${requestId}`); setMessage('');
    const response = await fetch(`/api/marketplace/customer/plugin-requests/${requestId}/respond`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), body: responseText }) });
    const body = await response.json(); setBusy('');
    if (!response.ok) return setMessage(body.error || 'Could not send information');
    setRequestResponses(current => ({ ...current, [requestId]: '' })); setMessage('Information sent for review.'); await load();
  }

  async function cancelPluginRequest(requestId: string) {
    setBusy(`cancel:${requestId}`); setMessage('');
    const response = await fetch(`/api/marketplace/customer/plugin-requests/${requestId}/cancel`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'Cancelled by the requesting customer.' }) });
    const body = await response.json(); setBusy('');
    if (!response.ok) return setMessage(body.error || 'Could not cancel request');
    setMessage('Request cancelled.'); await load();
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
    {signedIn && <section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="font-semibold">Request a plugin or feature</h2><p className="mt-1 text-xs text-slate-500">Wattanam approval does not install software. Your school administrator keeps final installation control.</p><div className="mt-4 grid gap-3 md:grid-cols-2"><label className="text-xs font-medium">Request type<select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={requestType} onChange={event=>setRequestType(event.target.value)}>{['FREE_APPROVAL','PURCHASE_ASSISTANCE','PRIVATE_PLUGIN_ACCESS','TRIAL','FEATURE_REQUEST'].map(value=><option key={value} value={value}>{value.toLowerCase().replaceAll('_',' ')}</option>)}</select></label>{requestType !== 'FEATURE_REQUEST' && <label className="text-xs font-medium">Plugin<select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={requestPluginId} onChange={event=>setRequestPluginId(event.target.value)}><option value="">Select plugin</option>{products.map(product=><option key={product.id} value={product.id}>{product.name}</option>)}</select></label>}<label className="text-xs font-medium md:col-span-2">Why does the school need this?<textarea className="mt-1 min-h-20 w-full rounded-lg border px-3 py-2 text-sm" value={requestReason} onChange={event=>setRequestReason(event.target.value)} /></label>{requestType === 'FEATURE_REQUEST' && <label className="text-xs font-medium md:col-span-2">Feature description<textarea className="mt-1 min-h-20 w-full rounded-lg border px-3 py-2 text-sm" value={featureDescription} onChange={event=>setFeatureDescription(event.target.value)} /></label>}</div><button className="btn btn-primary mt-3" disabled={!!busy} onClick={submitPluginRequest}>{busy === 'plugin-request' ? 'Submitting…' : 'Submit request'}</button>{pluginRequests.length > 0 && <div className="mt-5 space-y-2"><h3 className="text-sm font-semibold">Request history</h3>{pluginRequests.map(item=><div key={item.id} className="rounded-lg border p-3 text-sm"><strong>{item.plugin?.name || 'Feature request'}</strong> · {item.status.toLowerCase().replaceAll('_',' ')}<div className="mt-1 text-xs text-slate-500">Submitted {new Date(item.submittedAt).toLocaleString()} · target {new Date(item.slaDueAt).toLocaleString()}</div>{item.status === 'NEEDS_INFORMATION' && <div className="mt-3 flex gap-2"><input aria-label="Requested information" className="min-w-0 flex-1 rounded-lg border px-3 py-2" placeholder="Provide the requested information" value={requestResponses[item.id] || ''} onChange={event=>setRequestResponses(current=>({ ...current, [item.id]: event.target.value }))} /><button className="btn btn-primary" disabled={!!busy} onClick={()=>respondToPluginRequest(item.id)}>Send</button></div>}{!['REJECTED','CANCELLED','ENTITLEMENT_ISSUED'].includes(item.status) && <button className="btn btn-secondary mt-2" disabled={!!busy} onClick={()=>cancelPluginRequest(item.id)}>{busy === `cancel:${item.id}` ? 'Cancelling…' : 'Cancel request'}</button>}</div>)}</div>}</section>}
    <section className="grid gap-5 md:grid-cols-2">{products.map(product => <article key={product.id} className="rounded-2xl border bg-white p-6 shadow-sm"><div className="flex justify-between gap-4"><div><h2 className="text-lg font-semibold text-slate-900">{product.name}</h2><p className="text-xs text-slate-500">{product.publisher.displayName} · {product.license}</p></div><span className={`h-fit rounded-full px-2 py-1 text-xs font-semibold ${product.compatible?'bg-emerald-50 text-emerald-700':'bg-red-50 text-red-700'}`}>{product.compatible?'Compatible':'Incompatible'}</span></div><p className="mt-3 text-sm text-slate-600">{product.description}</p><div className="mt-4 text-sm"><strong>{product.paid ? (product.prices[0] ? formatMoney(product.prices[0].amountMinor, product.prices[0].currency) : 'Price unavailable') : 'Free'}</strong>{product.versions[0] && <p className="mt-1 text-xs text-slate-500">Version {product.versions[0].version} · core {product.versions[0].requiresCore}<br />{product.versions[0].changelog}</p>}</div>{product.ownership?.length ? <div className="mt-4 space-y-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><div>Owned: {product.ownership.map(x=>`${x.installationLabel||x.installationId} (${x.status.toLowerCase()})`).join(', ')}</div>{product.versions[0]?.sha256 && <a className="btn btn-primary inline-flex" href={`/api/marketplace/artifacts/${product.versions[0].sha256}`}>Download verified package</a>}</div> : product.paid ? <button className="btn btn-primary mt-4" disabled={!signedIn || !product.compatible || busy===product.id} onClick={()=>checkout(product)}>{busy===product.id?'Creating order…':'Buy / request invoice'}</button> : <div className="mt-4 text-sm text-indigo-700">Free acquisition is available through the school plugin installer.</div>}</article>)}</section>
  </div></main>;
}
