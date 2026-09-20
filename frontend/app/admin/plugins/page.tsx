'use client';

import { useEffect, useState } from 'react';
import AuthGuard from '../../../components/AuthGuard';
import Sidebar from '../../../components/Sidebar';
import { adminNav } from '../../../lib/admin-nav';
import { apiFetch } from '../../../lib/api';
import { formatMoney } from '../../../lib/formatMoney';

interface PluginRecord {
  id: string;
  name: string;
  description: string;
  version: string;
  publisher: string;
  status: 'installed' | 'active' | 'inactive' | 'failed';
  capabilities: string[];
  permissions: string[];
  requiresCore: string | null;
  packageSha256: string;
  installedAt: string;
  lastError: string | null;
}

interface UpdateStatus {
  enabled: boolean;
  reason?: string;
  repository?: string;
  checkedAt?: string;
  pluginUpdates?: Array<{
    pluginId: string;
    installedVersion: string;
    status: PluginRecord['status'];
    release: { version: string; publisher: string; requiresCore: string; changelog?: string; sizeBytes: number };
  }>;
  advisories?: Array<{ id: string; pluginId: string; title: string; severity: string; affectedVersions: string; fixedVersion?: string }>;
  core?: { installedVersion: string; updates: Array<{ version: string; releaseNotes: string; blockedByActivePlugins: string[] }> };
}

interface PluginExtensions { navigation: Array<{ pluginId: string; id: string; label: string; href: string; permission?: string }>; pages?: Array<{ pluginId: string; id: string; title: string; routePath: string; kind: string }> }
interface MarketplaceLinkStatus { linked: boolean; accountEmailMasked?: string; scope?: string; expiresAt?: string; pending?: { requestId: string; startedAt: string; expiresAt: string } | null }
interface CatalogProduct {
  id: string; name: string; description: string; license: string; paid: boolean;
  publisher: { slug: string; displayName: string };
  prices: Array<{ id: string; currency: string; amountMinor: number }>;
  versions: Array<{ version: string; requiresCore: string; changelog?: string }>;
  compatible: boolean;
  ownership?: Array<{ installationId: string; installationLabel?: string; status: string }>;
}
interface MarketplaceOrder {
  id: string; status: string; currency: string; totalMinor: number; createdAt: string;
  lines: Array<{ pluginId: string; plugin?: { id: string; name: string } }>;
}

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<PluginRecord[]>([]);
  const [updates, setUpdates] = useState<UpdateStatus | null>(null);
  const [extensions, setExtensions] = useState<PluginExtensions>({ navigation: [] });
  const [runtime, setRuntime] = useState<{ safeMode: boolean; loaded: string[] } | null>(null);
  const [linkStatus, setLinkStatus] = useState<MarketplaceLinkStatus | null>(null);
  const [registration, setRegistration] = useState<{ registered: boolean; marketplaceConfigured: boolean } | null>(null);
  const [linking, setLinking] = useState(false);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  async function load() {
    const [pluginsResponse, updatesResponse, extensionsResponse, runtimeResponse] = await Promise.all([apiFetch('/api/plugins'), apiFetch('/api/updates'), apiFetch('/api/plugin-api/extensions'), apiFetch('/api/plugins/runtime-status')]);
    if (!pluginsResponse.ok) throw new Error(`Could not load plugins (${pluginsResponse.status})`);
    setPlugins(await pluginsResponse.json());
    if (updatesResponse.ok) setUpdates(await updatesResponse.json());
    if (extensionsResponse.ok) setExtensions(await extensionsResponse.json());
    if (runtimeResponse.ok) setRuntime(await runtimeResponse.json());
    const status = await loadLinkStatus();
    const registrationResponse = await apiFetch('/api/admin/marketplace/installation');
    if (registrationResponse.ok) setRegistration(await registrationResponse.json());
    if (status?.linked) { await loadCatalog(); await loadOrders(); }
  }

  async function loadLinkStatus(): Promise<MarketplaceLinkStatus | undefined> {
    const response = await apiFetch('/api/admin/marketplace/link/status');
    if (!response.ok) return undefined;
    const result = await response.json();
    setLinkStatus(result);
    return result;
  }

  async function loadCatalog() {
    setCatalogError('');
    try {
      const response = await apiFetch('/api/admin/marketplace/catalog');
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || `Could not load the marketplace catalog (${response.status})`);
      setCatalog(Array.isArray(result) ? result : []);
    } catch (cause) { setCatalogError(cause instanceof Error ? cause.message : 'Could not load the marketplace catalog'); }
  }

  async function loadOrders() {
    const response = await apiFetch('/api/admin/marketplace/orders');
    if (response.ok) setOrders(await response.json());
  }

  async function buy(product: CatalogProduct) {
    const price = product.prices[0];
    if (!price) return setError('This plugin has no available price.');
    setBusy(`${product.id}:buy`); setError('');
    try {
      const response = await apiFetch('/api/admin/marketplace/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ priceId: price.id, currency: price.currency }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || `Order creation failed (${response.status})`);
      await loadOrders();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Order creation failed'); }
    finally { setBusy(''); }
  }

  async function installFromMarketplace(product: CatalogProduct) {
    const version = product.versions[0]?.version;
    if (!version) return setError('No compatible version is available to install.');
    setBusy(`${product.id}:install`); setError('');
    try {
      const response = await apiFetch(`/api/admin/marketplace/plugins/${encodeURIComponent(product.id)}/${encodeURIComponent(version)}/install`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || `Installation failed (${response.status})`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Installation failed'); }
    finally { setBusy(''); }
  }

  async function startLink() {
    // Reserve the tab during the click. Opening it after the network round trip is blocked by
    // popup protection in several browsers, leaving the owner with an invisible approval step.
    const approvalTab = window.open('about:blank', '_blank');
    setLinking(true); setError('');
    try {
      const response = await apiFetch('/api/admin/marketplace/link/start', { method: 'POST' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || `Could not start linking (${response.status})`);
      // The approval UI belongs to this school frontend. The marketplace service returns an API
      // origin for machine-to-machine calls and intentionally has no browser page at this path.
      // Keeping this same-origin also ensures account credentials/session cookies only pass
      // through the frontend's allowlisted server-side marketplace proxy.
      const requestId = String(result.requestId || '');
      if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error('Marketplace returned an invalid link request');
      const approvalUrl = `/marketplace/link/${encodeURIComponent(requestId)}`;
      if (approvalTab) { approvalTab.opener = null; approvalTab.location.href = approvalUrl; }
      else {
        setError('Your browser blocked the approval tab. Use the Open approval page link below, then choose Finish linking.');
        await loadLinkStatus();
        return;
      }
      await awaitApproval();
    } catch (cause) { approvalTab?.close(); setError(cause instanceof Error ? cause.message : 'Linking failed'); }
    finally { setLinking(false); }
  }

  /**
   * Polls until the account owner answers.
   *
   * The request id is deliberately not passed: the school recorded it when linking started, so a
   * reload of this page resumes the same request instead of stranding an approval that can never
   * be exchanged. Every call re-reads it server-side, which is also why this can be resumed from a
   * fresh page load with no state of its own.
   */
  async function awaitApproval() {
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
      const pollResponse = await apiFetch('/api/admin/marketplace/link/poll', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
      const pollResult = await pollResponse.json().catch(() => ({}));
      if (!pollResponse.ok) throw new Error(pollResult.message || 'Linking failed');
      if (pollResult.status === 'linked') { await loadLinkStatus(); await loadCatalog(); await loadOrders(); return; }
      if (pollResult.status === 'denied') throw new Error('The marketplace account owner denied this link request.');
      if (pollResult.status === 'expired') throw new Error('The link request expired before it was approved.');
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  /** Picks up an approval granted while this page was closed. */
  async function resumeLink() {
    setLinking(true); setError('');
    try { await awaitApproval(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Linking failed'); }
    finally { setLinking(false); }
  }

  async function revokeLink() {
    if (!window.confirm('Unlink this marketplace account? Buying and installing new plugins from this panel will stop working until relinked.')) return;
    setLinking(true); setError('');
    try {
      const response = await apiFetch('/api/admin/marketplace/link/revoke', { method: 'POST' });
      if (!response.ok) throw new Error(`Unlink failed (${response.status})`);
      await loadLinkStatus();
      setCatalog([]);
      setOrders([]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unlink failed'); }
    finally { setLinking(false); }
  }

  async function installRepositoryUpdate(pluginId: string, version: string) {
    setBusy(`${pluginId}:update`); setError('');
    try {
      const response = await apiFetch(`/api/updates/plugins/${encodeURIComponent(pluginId)}/${encodeURIComponent(version)}/install`, { method: 'POST' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || `Update failed (${response.status})`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Update failed'); }
    finally { setBusy(''); }
  }

  useEffect(() => { load().catch((cause) => setError(cause.message)); }, []);

  async function removePlugin(plugin: PluginRecord) {
    if (!window.confirm(`Remove ${plugin.name} files? Plugin settings, storage, migrations, and business data will be preserved.`)) return;
    setBusy(`${plugin.id}:remove`); setError('');
    try {
      const response = await apiFetch(`/api/plugins/${encodeURIComponent(plugin.id)}`, { method: 'DELETE' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || `Removal failed (${response.status})`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Removal failed'); }
    finally { setBusy(''); }
  }

  async function lifecycle(plugin: PluginRecord, action: 'activate' | 'deactivate') {
    setBusy(`${plugin.id}:${action}`); setError('');
    try {
      const response = await apiFetch(`/api/plugins/${encodeURIComponent(plugin.id)}/${action}`, { method: 'POST' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || `${action} failed (${response.status})`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : `${action} failed`); }
    finally { setBusy(''); }
  }

  return (
    <AuthGuard allowedRoles={['SUPER_ADMIN']}>
      <div className="page-shell">
        <Sidebar title="Admin Panel" subtitle="Wattanam" navItems={adminNav} accentColor="indigo" />
        <div className="page-content">
          <div className="h-14 lg:hidden" />
          <div className="page-header"><h1 className="text-2xl font-bold text-slate-800">Plugin Manager</h1><p className="mt-1 text-sm text-slate-500">Browse, buy, and install verified plugins through the Wattanam Marketplace.</p></div>
          <div className="page-body space-y-6">
            {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
            {runtime?.safeMode && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><strong>Plugin safe mode is active.</strong> No plugin code is loaded and activation is disabled. Core administration remains available.</div>}
            <section className="card p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="font-semibold text-slate-800">Official repository</h2><p className="mt-1 text-sm text-slate-500">Repository metadata and downloaded packages are verified locally before installation.</p></div>
                {updates?.repository && <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{updates.repository}</span>}
              </div>
              {updates && !updates.enabled && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Updates are disabled: {updates.reason}</p>}
              {!!updates?.advisories?.length && <div className="mt-4 space-y-2">{updates.advisories.map((advisory) => <div key={advisory.id} className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><strong>{advisory.severity.toUpperCase()}: {advisory.title}</strong><div className="mt-1 font-mono text-xs">{advisory.pluginId} {advisory.affectedVersions}{advisory.fixedVersion ? ` · fixed in ${advisory.fixedVersion}` : ''}</div></div>)}</div>}
              {!!updates?.pluginUpdates?.length && <div className="mt-5 space-y-3">{updates.pluginUpdates.map((update) => <div key={update.pluginId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-4"><div><strong className="text-slate-800">{update.pluginId}</strong><p className="mt-1 text-xs text-slate-500">{update.installedVersion} → {update.release.version} · requires core {update.release.requiresCore}</p>{update.release.changelog && <p className="mt-2 text-sm text-slate-600">{update.release.changelog}</p>}</div><button className="btn btn-primary" disabled={!!busy || update.status === 'active'} title={update.status === 'active' ? 'Deactivate this plugin before updating' : undefined} onClick={() => installRepositoryUpdate(update.pluginId, update.release.version)}>{busy === `${update.pluginId}:update` ? 'Verifying…' : update.status === 'active' ? 'Deactivate first' : 'Install update'}</button></div>)}</div>}
              {!!updates?.core?.updates?.length && <div className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-sm font-semibold text-slate-700">Core updates</h3>{updates.core.updates.map((update) => <div key={update.version} className="mt-3 rounded-lg bg-slate-50 p-3 text-sm"><strong>Wattanam {update.version}</strong><p className="mt-1 text-slate-600">{update.releaseNotes}</p>{update.blockedByActivePlugins.length > 0 && <p className="mt-2 text-amber-700">Compatibility review required: {update.blockedByActivePlugins.join(', ')}</p>}</div>)}</div>}
              {updates?.enabled && !updates.pluginUpdates?.length && !updates.core?.updates?.length && <p className="mt-4 text-sm text-emerald-700">Installed core and plugins are current for this channel.</p>}
            </section>

            <section className="card p-6">
              <h2 className="font-semibold text-slate-800">Marketplace</h2>
              <p className="mt-1 text-sm text-slate-500">After registering this school in Licensing, its marketplace account owner approves a link here. The owner signs in with MFA; school administrators never need their password.</p>
              {registration && !registration.registered && <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">This school is not registered with the marketplace yet. <a className="font-semibold underline" href="/admin/licensing">Open Licensing</a> and enter the one-time token from Platform Admin first.</div>}
              {linkStatus?.linked ? (
                <>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                    <span>Linked as {linkStatus.accountEmailMasked || 'a marketplace account'}</span>
                    <button className="btn btn-secondary" disabled={linking} onClick={revokeLink}>{linking ? 'Unlinking…' : 'Unlink'}</button>
                  </div>
                  {catalogError && <p className="mt-3 text-sm text-red-700">{catalogError}</p>}
                  {catalog.length > 0 && <div className="mt-4 grid gap-4 md:grid-cols-2">{catalog.map((product) => {
                    const owned = !!product.ownership?.some((entry) => entry.status === 'ACTIVE');
                    return (
                    <div key={product.id} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-2"><div><strong className="text-slate-800">{product.name}</strong><p className="text-xs text-slate-500">{product.publisher.displayName} · {product.license}</p></div><span className={`h-fit rounded-full px-2 py-1 text-xs font-semibold ${product.compatible ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{product.compatible ? 'Compatible' : 'Incompatible'}</span></div>
                      <p className="mt-2 text-sm text-slate-600">{product.description}</p>
                      <div className="mt-2 text-sm font-medium text-slate-700">{product.paid ? (product.prices[0] ? formatMoney(product.prices[0].amountMinor, product.prices[0].currency) : 'Price unavailable') : 'Free'}</div>
                      {product.versions[0] && <p className="mt-1 text-xs text-slate-500">Version {product.versions[0].version} · requires core {product.versions[0].requiresCore}</p>}
                      {!!product.ownership?.length && <p className="mt-2 text-xs text-emerald-700">Owned: {product.ownership.map((entry) => `${entry.installationLabel || entry.installationId} (${entry.status.toLowerCase()})`).join(', ')}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {product.paid && !owned && <button className="btn btn-primary" disabled={!!busy || !product.compatible} onClick={() => buy(product)}>{busy === `${product.id}:buy` ? 'Creating order…' : 'Buy'}</button>}
                        {product.compatible && (owned || !product.paid) && <button className="btn btn-primary" disabled={!!busy} onClick={() => installFromMarketplace(product)}>{busy === `${product.id}:install` ? 'Installing…' : 'Install'}</button>}
                      </div>
                    </div>
                    );
                  })}</div>}
                  {catalog.length === 0 && !catalogError && (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      <p className="font-semibold">This school is linked, but the marketplace catalog is empty.</p>
                      <p className="mt-1">Ask a platform operator to publish at least one approved plugin release in Marketplace Admin.</p>
                    </div>
                  )}
                  {orders.length > 0 && <div className="mt-6 border-t border-slate-100 pt-4">
                    <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-700">Orders</h3><button className="btn btn-secondary" onClick={loadOrders}>Refresh</button></div>
                    <div className="mt-3 space-y-2">{orders.map((order) => <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                      <span>{order.lines.map((line) => line.plugin?.name || line.pluginId).join(', ')} · {formatMoney(order.totalMinor, order.currency)}</span>
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${order.status === 'PAID' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{order.status === 'PENDING' ? 'Awaiting settlement' : order.status.toLowerCase()}</span>
                    </div>)}</div>
                  </div>}
                </>
              ) : (
                <div className="mt-4">
                  {linkStatus?.pending ? (
                    // An approval granted while this page was closed is still claimable, so offer to
                    // finish it rather than starting again and asking the owner to approve twice.
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <button className="btn btn-primary" disabled={linking} onClick={resumeLink}>{linking ? 'Checking…' : 'Finish linking'}</button>
                        <a className="btn btn-secondary" href={`/marketplace/link/${encodeURIComponent(linkStatus.pending.requestId)}`} target="_blank" rel="noopener noreferrer">Open approval page ↗</a>
                        <button className="btn" disabled={linking} onClick={startLink}>Start over</button>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">A link request from {new Date(linkStatus.pending.startedAt).toLocaleString()} is still waiting. If the account owner has approved it, finishing completes the link without asking them again.</p>
                    </>
                  ) : (
                    <>
                        <button className="btn btn-primary" disabled={linking || registration?.registered === false} onClick={startLink}>{linking ? 'Waiting for approval…' : 'Link marketplace account'}</button>
                      <p className="mt-2 text-xs text-slate-500">Opens the marketplace in a new tab, where the account owner reviews and approves the requested permissions.</p>
                    </>
                  )}
                </div>
              )}
            </section>

            <section className="space-y-4">
              {plugins.length === 0 && <div className="card p-8 text-center text-sm text-slate-500">No plugins are installed.</div>}
              {plugins.map((plugin) => (
                <article key={plugin.id} className="card p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div><div className="flex items-center gap-2"><h2 className="text-lg font-bold text-slate-800">{plugin.name}</h2><Status value={plugin.status} /></div><p className="mt-1 font-mono text-xs text-slate-500">{plugin.id} · {plugin.version} · {plugin.publisher}</p><p className="mt-3 max-w-3xl text-sm text-slate-600">{plugin.description}</p></div>
                    <div className="flex gap-2">{plugin.status === 'active'
                      ? <button className="btn btn-secondary" disabled={!!busy} onClick={() => lifecycle(plugin, 'deactivate')}>Deactivate</button>
                      : <button className="btn btn-primary" disabled={!!busy || plugin.status === 'failed' || runtime?.safeMode} onClick={() => lifecycle(plugin, 'activate')}>Activate</button>}
                      {plugin.status !== 'active' && <button className="btn btn-secondary text-red-700" disabled={!!busy} onClick={() => removePlugin(plugin)}>Remove files</button>}</div>
                  </div>
                  <dl className="mt-5 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-3">
                    <Info label="Core compatibility" value={plugin.requiresCore || 'Not declared'} />
                    <Info label="Capabilities" value={plugin.capabilities.join(', ') || 'None'} />
                    <Info label="Permissions" value={plugin.permissions.join(', ') || 'None'} />
                  </dl>
                  {plugin.lastError && <div className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">{plugin.lastError}</div>}
                  {extensions.navigation.filter((entry) => entry.pluginId === plugin.id).length > 0 && <div className="mt-4 flex flex-wrap gap-2">{extensions.navigation.filter((entry) => entry.pluginId === plugin.id).map((entry) => <a key={entry.id} href={entry.href} className="btn btn-secondary">{entry.label}</a>)}</div>}
                  <details className="mt-4 text-xs text-slate-500"><summary className="cursor-pointer">Package checksum</summary><code className="mt-2 block break-all">{plugin.packageSha256}</code></details>
                </article>
              ))}
            </section>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}

function Status({ value }: { value: PluginRecord['status'] }) {
  const style = value === 'active' ? 'bg-emerald-50 text-emerald-700' : value === 'failed' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{value}</span>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 break-words text-sm text-slate-700">{value}</dd></div>;
}
