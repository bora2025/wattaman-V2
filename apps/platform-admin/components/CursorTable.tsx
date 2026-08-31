'use client';

import { useCallback, useEffect, useState } from 'react';
import { platformJson } from '../lib/api';

interface Page<T> { items: T[]; nextCursor: string | null }

/** Shared cursor-paginated list (plan §7: cursor pagination, bounded page sizes, stable sorting).
 * Pages forward only for now — PA-2 adds filters and URL-encoded state. */
export default function CursorTable<T extends { id: string }>(props: {
  path: string;
  columns: Array<{ header: string; render: (row: T) => React.ReactNode }>;
  emptyMessage: string;
}) {
  const { path, columns, emptyMessage } = props;
  const [rows, setRows] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (from: string | null) => {
    setLoading(true); setError('');
    try {
      const query = from ? `?cursor=${encodeURIComponent(from)}` : '';
      const page = await platformJson<Page<T>>(`${path}${query}`);
      setRows(page.items);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load');
    } finally { setLoading(false); }
  }, [path]);

  useEffect(() => { load(cursor); }, [load, cursor]);

  if (error) return <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>;

  return (
    <div className="space-y-3">
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
