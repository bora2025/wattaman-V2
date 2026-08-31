'use client';

import { useCallback, useEffect, useState } from 'react';
import { platformJson } from '../lib/api';

interface Page<T> { items: T[]; nextCursor: string | null }
export interface TableFilter {
  key: string;
  label: string;
  type?: 'text' | 'select';
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
}

/** Shared cursor-paginated list (plan §7: cursor pagination, bounded page sizes, stable sorting).
 * Pages forward only for now — PA-2 adds filters and URL-encoded state. */
export default function CursorTable<T extends { id: string }>(props: {
  path: string;
  columns: Array<{ header: string; render: (row: T) => React.ReactNode }>;
  emptyMessage: string;
  filters?: TableFilter[];
}) {
  const { path, columns, emptyMessage, filters = [] } = props;
  const [rows, setRows] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draftFilters, setDraftFilters] = useState<Record<string, string>>({});
  const [appliedQuery, setAppliedQuery] = useState('');
  const filterSignature = filters.map(filter => filter.key).join('|');

  useEffect(() => {
    const source = new URLSearchParams(window.location.search);
    const initial: Record<string, string> = {};
    for (const filter of filters) {
      const value = source.get(filter.key);
      if (value) initial[filter.key] = value;
    }
    setDraftFilters(initial);
    const normalized = new URLSearchParams();
    Object.entries(initial).forEach(([key, value]) => normalized.set(key, value));
    setAppliedQuery(normalized.toString());
  // Page-level filter definitions are inline arrays, so depend on their stable key signature
  // instead of array identity (which changes on every parent render).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSignature]);

  const load = useCallback(async (from: string | null) => {
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams(appliedQuery);
      if (from) query.set('cursor', from);
      const page = await platformJson<Page<T>>(`${path}${query.size ? `?${query}` : ''}`);
      setRows(page.items);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load');
    } finally { setLoading(false); }
  }, [path, appliedQuery]);

  useEffect(() => { load(cursor); }, [load, cursor]);

  if (error) return <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>;

  function applyFilters() {
    const query = new URLSearchParams();
    for (const filter of filters) {
      const value = draftFilters[filter.key]?.trim();
      if (value) query.set(filter.key, value);
    }
    const value = query.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${value ? `?${value}` : ''}`);
    setCursor(null);
    setAppliedQuery(value);
  }

  function clearFilters() {
    setDraftFilters({});
    window.history.replaceState(null, '', window.location.pathname);
    setCursor(null);
    setAppliedQuery('');
  }

  return (
    <div className="space-y-3">
      {filters.length > 0 && <form className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4" onSubmit={event => { event.preventDefault(); applyFilters(); }}>
        {filters.map(filter => <label key={filter.key} className="min-w-44 flex-1 text-xs font-medium text-slate-600">{filter.label}
          {filter.type === 'select' ? <select className="pa-input mt-1" value={draftFilters[filter.key] || ''} onChange={event => setDraftFilters(current => ({ ...current, [filter.key]: event.target.value }))}>
            <option value="">All</option>{filter.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select> : <input className="pa-input mt-1" value={draftFilters[filter.key] || ''} placeholder={filter.placeholder} onChange={event => setDraftFilters(current => ({ ...current, [filter.key]: event.target.value }))} />}
        </label>)}
        <button className="pa-btn-primary" type="submit">Apply filters</button>
        <button className="pa-btn-secondary" type="button" onClick={clearFilters}>Clear</button>
      </form>}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>{columns.map((column) => <th key={column.header} scope="col" className="px-4 py-3">{column.header}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100 last:border-0">
                {columns.map((column) => <td key={column.header} className="px-4 py-3 align-top">{column.render(row)}</td>)}
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={columns.length} className="px-4 py-6 text-center text-slate-500">{emptyMessage}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button className="pa-btn-secondary" disabled={loading || !cursor} onClick={() => setCursor(null)}>First page</button>
        <button className="pa-btn-secondary" disabled={loading || !nextCursor} onClick={() => setCursor(nextCursor)}>Next page</button>
        {loading && <span className="text-sm text-slate-500">Loading…</span>}
      </div>
    </div>
  );
}
