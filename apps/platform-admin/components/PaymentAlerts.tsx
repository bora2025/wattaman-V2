'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { platformJson } from '../lib/api';

interface PaymentAlert {
  id: string; provider: string; providerReference: string; amountMinor: number; createdAt: string; source: string; submittedBy: string | null;
  invoice: { id: string; invoiceNumber: string; currency: string; school: { id: string; name: string } };
}
interface PaymentAlertFeed { measuredAt: string; count: number; items: PaymentAlert[] }

const SEEN_KEY = 'wattanam.platform.payment-alerts.seen';
const ENABLED_KEY = 'wattanam.platform.payment-alerts.enabled';

export default function PaymentAlerts() {
  const [items, setItems] = useState<PaymentAlert[]>([]);
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);

  const playTone = useCallback(() => {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const audio = new AudioContextClass();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(880, audio.currentTime);
    gain.gain.setValueAtTime(0.0001, audio.currentTime); gain.gain.exponentialRampToValueAtTime(0.2, audio.currentTime + 0.02); gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.45);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + 0.46);
    oscillator.addEventListener('ended', () => void audio.close());
  }, []);

  const notify = useCallback((alert: PaymentAlert) => {
    playTone();
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification('Customer payment received', {
        body: `${alert.invoice.school.name} sent ${(alert.amountMinor / 100).toFixed(2)} ${alert.invoice.currency} for ${alert.invoice.invoiceNumber}. Review payment evidence.`,
        tag: `payment-${alert.id}`,
      });
      notification.onclick = () => { window.focus(); window.location.href = `/schools/${alert.invoice.school.id}`; notification.close(); };
    }
  }, [playTone]);

  const load = useCallback(async () => {
    const feed = await platformJson<PaymentAlertFeed>('payment-alerts');
    setItems(feed.items);
    const seen = new Set<string>(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));
    const alertsEnabled = localStorage.getItem(ENABLED_KEY) === 'true';
    setEnabled(alertsEnabled);
    if (alertsEnabled) {
      const unseen = feed.items.filter(item => !seen.has(item.id));
      if (unseen.length) { notify(unseen[0]); setOpen(true); }
      feed.items.forEach(item => seen.add(item.id));
      localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)));
    }
  }, [notify]);

  useEffect(() => {
    load().catch(() => undefined);
    const timer = window.setInterval(() => load().catch(() => undefined), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function enableAlerts() {
    localStorage.setItem(ENABLED_KEY, 'true'); setEnabled(true); playTone();
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
    const seen = new Set<string>(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));
    items.forEach(item => seen.add(item.id));
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)));
  }

  return <div className="relative">
    {!enabled ? <button className="pa-btn-secondary" onClick={enableAlerts} title="Enable sound and desktop notifications for customer payments">🔔 Enable payment alerts</button> : <button className="pa-btn-secondary relative" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-label={`${items.length} pending payment alerts`}>🔔 Payments{items.length > 0 && <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">{items.length}</span>}</button>}
    {open && <div className="absolute right-0 z-50 mt-2 w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
      <div className="border-b bg-slate-50 px-4 py-3"><div className="font-semibold">Payment notifications</div><div className="text-xs text-slate-500">Pending customer evidence awaiting review</div></div>
      {items.length === 0 ? <p className="p-4 text-sm text-slate-500">No pending customer payments.</p> : <div className="max-h-96 divide-y overflow-y-auto">{items.map(item => <Link key={item.id} href={`/schools/${item.invoice.school.id}`} onClick={() => setOpen(false)} className="block p-4 hover:bg-slate-50"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{item.invoice.school.name}</div><div className="text-xs text-slate-500">{item.invoice.invoiceNumber} · {item.providerReference}</div></div><div className="whitespace-nowrap font-bold text-emerald-700">{new Intl.NumberFormat(undefined, { style: 'currency', currency: item.invoice.currency }).format(item.amountMinor / 100)}</div></div><div className="mt-2 text-xs text-slate-500">Sent {new Date(item.createdAt).toLocaleString()} · Open to verify and approve</div></Link>)}</div>}
    </div>}
  </div>;
}
