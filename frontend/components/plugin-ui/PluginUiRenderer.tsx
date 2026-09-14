'use client';

import PluginDataTable from './PluginDataTable';
import PluginForm from './PluginForm';
import PluginActions from './PluginActions';
import { useCallback, useState } from 'react';
import type { PluginUiPageDescriptor } from '../../lib/plugin-ui-routing';

export default function PluginUiRenderer({ pluginId, page, params, data, loading, errors, onRefresh }: { pluginId: string; page: PluginUiPageDescriptor; params: Record<string, string>; data: Record<string, unknown>; loading: boolean; errors: Record<string, string>; onRefresh(): void | Promise<void> }) {
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const updateSelection = useCallback((source: string, ids: string[]) => setSelections((current) => {
    if ((current[source] || []).join('\0') === ids.join('\0')) return current;
    return { ...current, [source]: ids };
  }), []);
  return <div className="space-y-5">{page.components.map((component: any) => {
    if (component.type === 'table') return <PluginDataTable key={component.id} title={component.title} value={component.source ? data[component.source] : []} fields={component.fields} options={component.options} loading={loading} error={component.source ? errors[component.source] : undefined} onSelectionChange={component.source ? (ids) => updateSelection(component.source, ids) : undefined} />;
    if (component.type === 'form') { const source = page.dataSources.find((entry) => entry.id === component.source); const initialSource = component.options?.initialSource; return source && source.method !== 'GET' && source.method !== 'DELETE' ? <PluginForm key={component.id} pluginId={pluginId} source={source as any} params={params} fields={component.fields || []} options={component.options as any} initialData={typeof initialSource === 'string' ? data[initialSource] : undefined} onSuccess={onRefresh} /> : null; }
    if (component.type === 'actions') return <PluginActions key={component.id} pluginId={pluginId} sources={page.dataSources.filter((entry) => entry.method !== 'GET') as any} params={params} actions={(component.options?.actions || []) as any} selections={selections} onSuccess={onRefresh} />;
    if (component.type === 'heading') return <h2 key={component.id} className="text-xl font-semibold text-slate-800">{component.title}</h2>;
    if (component.type === 'text') return <p key={component.id} className="text-sm text-slate-600">{component.title}</p>;
    return <section key={component.id} className="card p-5 text-sm text-slate-500">{component.title || component.type} will be rendered by its LC3 component.</section>;
  })}</div>;
}
