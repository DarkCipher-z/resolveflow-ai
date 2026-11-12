'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Shield,
} from 'lucide-react';
import { ProvenanceBadge } from '@/components/provenance-badge';
import { DeadlineBadge } from '@/components/deadline-badge';
import {
  formatDisputeReason,
  formatDisputeStatus,
  formatLifecycleStage,
  formatDateIST,
  formatTimeIST,
} from '@/lib/dispute-helpers';

const filterTabs = [
  { label: 'All Cases', value: 'ALL' },
  { label: 'Action Required', value: 'ACTION_REQUIRED' },
  { label: 'Waiting for Buyer', value: 'WAITING_FOR_BUYER' },
  { label: 'Under Review', value: 'UNDER_REVIEW' },
  { label: 'Resolved', value: 'RESOLVED' },
];

export default function DisputeInboxPage() {
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  async function loadDisputes() {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (activeFilter !== 'ALL') params.set('status', activeFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`/api/disputes?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setDisputes(json.data);
      } else {
        setError(json.error);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    try {
      setIsSyncing(true);
      const res = await fetch('/api/disputes/sync', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        await loadDisputes();
      } else {
        alert(`Sync failed: ${json.error}`);
      }
    } catch (e: any) {
      alert(`Sync error: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  }

  useEffect(() => {
    loadDisputes();
  }, [activeFilter]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    loadDisputes();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Dispute Inbox</h1>
            <ProvenanceBadge origin="PAYPAL" />
          </div>
          <p className="text-xs text-secondary mt-1">
            Authoritative records synchronized from PayPal Sandbox. Live allowed actions derived dynamically.
          </p>
        </div>

        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary hover:text-white hover:bg-primary border border-primary/30 rounded-md transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Syncing...' : 'Sync Sandbox'}</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto bg-slate-200/60 p-1 rounded-lg">
          {filterTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveFilter(tab.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                activeFilter === tab.value
                  ? 'bg-white text-foreground shadow-sm font-semibold'
                  : 'text-secondary hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="relative min-w-[260px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input
            type="text"
            placeholder="Search dispute ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </form>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-lg border border-border shadow-sm overflow-hidden">
        {/* Loading State */}
        {loading && (
          <div className="p-16 text-center text-secondary text-xs flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            <span>Retrieving dispute records...</span>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="p-8 text-center text-xs">
            <div className="inline-flex p-3 rounded-full bg-red-50 text-critical mb-2">
              <AlertCircle className="w-5 h-5" />
            </div>
            <p className="font-semibold text-critical">Failed to load disputes</p>
            <p className="text-secondary mt-1">{error}</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && disputes.length === 0 && (
          <div className="p-16 text-center text-xs text-secondary space-y-3">
            <Shield className="w-8 h-8 mx-auto text-slate-300" />
            <p className="font-medium text-foreground text-sm">No disputes matching this filter</p>
            <p className="max-w-sm mx-auto">
              {searchQuery
                ? `No disputes matched "${searchQuery}". Try clearing search.`
                : 'No disputes in this state. Try selecting another filter or sync with PayPal.'}
            </p>
          </div>
        )}

        {/* Table */}
        {!loading && !error && disputes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] border-b border-border text-secondary font-medium">
                <tr>
                  <th className="py-3 px-4">Dispute ID</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4">Disputed Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Stage</th>
                  <th className="py-3 px-4">Response Deadline</th>
                  <th className="py-3 px-4">Evidence Coverage</th>
                  <th className="py-3 px-4">Last Synced</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {disputes.map((dispute) => {
                  return (
                    <tr key={dispute.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-medium text-foreground">
                        <Link
                          href={`/disputes/${dispute.id}`}
                          className="text-primary hover:underline flex items-center gap-1"
                        >
                          <span>{dispute.paypal_dispute_id}</span>
                        </Link>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-foreground">
                        {formatDisputeReason(dispute.reason)}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-foreground">
                        {dispute.currency_code} {Number(dispute.amount).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          {formatDisputeStatus(dispute.status)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-secondary">
                        {formatLifecycleStage(dispute.lifecycle_stage)}
                      </td>
                      <td className="py-3.5 px-4">
                        {dispute.seller_response_due_at ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-foreground font-medium">
                                {formatDateIST(dispute.seller_response_due_at)}
                              </span>
                              <DeadlineBadge dueDate={dispute.seller_response_due_at} />
                            </div>
                            <span className="block text-[10px] text-secondary">
                              {formatTimeIST(dispute.seller_response_due_at)}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="text-secondary italic">Not available</span>
                            <DeadlineBadge dueDate={null} />
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {dispute.coverage?.available ? (
                          <div className="flex items-center gap-2">
                            <div className="w-14 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-primary h-1.5 rounded-full"
                                style={{ width: `${dispute.coverage.percent}%` }}
                              ></div>
                            </div>
                            <span className="font-semibold text-foreground">
                              {dispute.coverage.numerator}/{dispute.coverage.denominator}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-secondary">Not available</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-secondary text-[11px]">
                        {dispute.last_synced_at
                          ? formatTimeIST(dispute.last_synced_at)
                          : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Link
                          href={`/disputes/${dispute.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-primary hover:text-white hover:bg-primary border border-primary/30 rounded transition-colors"
                        >
                          <span>Workspace</span>
                          <ChevronRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
