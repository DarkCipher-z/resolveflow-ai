'use client';

import { useState } from 'react';
import { RefreshCw, ExternalLink, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function Topbar() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncText, setLastSyncText] = useState<string | null>(null);
  const router = useRouter();

  async function handleSync() {
    try {
      setIsSyncing(true);
      const res = await fetch('/api/disputes/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setLastSyncText(`Synced ${data.data.syncedDisputesCount} disputes just now`);
        router.refresh();
      } else {
        alert(`Sync failed: ${data.error}`);
      }
    } catch (e: any) {
      alert(`Sync error: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <header className="h-14 bg-white border-b border-border px-6 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-3">
        {/* Sandbox Badge */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
          <span>PAYPAL SANDBOX CONNECTED</span>
        </div>

        <span className="text-xs text-secondary hidden md:inline">
          Account: <strong className="text-foreground">ResolveFlow AI US (Business)</strong>
        </span>
      </div>

      <div className="flex items-center gap-3">
        {lastSyncText && (
          <span className="text-xs text-secondary hidden sm:inline">
            {lastSyncText}
          </span>
        )}

        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary hover:text-white hover:bg-primary border border-primary/30 rounded-md transition-colors disabled:opacity-50"
          title="Fetch authoritative disputes from PayPal Sandbox"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Syncing...' : 'Sync Sandbox'}</span>
        </button>

        <a
          href="https://www.sandbox.paypal.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-secondary hover:text-foreground flex items-center gap-1 border-l border-border pl-3"
        >
          <span>Sandbox Portal</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </header>
  );
}
