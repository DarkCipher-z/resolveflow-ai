'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Clock,
  CheckCircle,
  FileCheck2,
  ArrowRight,
  RefreshCw,
  ShieldAlert,
  ChevronRight,
} from 'lucide-react';
import { ProvenanceBadge } from '@/components/provenance-badge';
import {
  formatDisputeReason,
  formatDisputeStatus,
  formatLifecycleStage,
  formatDateIST,
  formatTimeIST,
} from '@/lib/dispute-helpers';

export default function OverviewPage() {
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  async function loadDisputes() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/disputes');
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
  }, []);

  // Compute 4 KPIs
  const openDisputes = disputes.filter((d) => d.status !== 'RESOLVED' && d.status !== 'CLOSED');
  const dueWithin24h = disputes.filter((d) => ['URGENT', 'HIGH'].includes(d.priority));
  
  // Average coverage across active cases with parseable requirements
  const withCoverage = disputes.filter((d) => d.coverage?.available);
  const avgCoverage = withCoverage.length > 0
    ? Math.round(
        withCoverage.reduce((acc, curr) => acc + (curr.coverage?.percent || 0), 0) /
          withCoverage.length
      )
    : null;

  const resolvedCases = disputes.filter((d) => d.status === 'RESOLVED');

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dispute Operations Overview</h1>
          <p className="text-xs text-secondary mt-1">
            Authoritative case tracking and evidence readiness for merchant: <strong className="text-foreground">Northstar Goods</strong>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-md shadow-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing Sandbox...' : 'Sync with PayPal Sandbox'}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Open Disputes */}
        <div className="p-5 bg-white rounded-lg border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-secondary uppercase tracking-wider">Open Disputes</span>
            <div className="p-2 rounded-md bg-blue-50 text-primary">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-foreground">
              {loading ? '—' : openDisputes.length}
            </div>
            <p className="text-[11px] text-secondary mt-1">
              Active inquiries & chargebacks
            </p>
          </div>
        </div>

        {/* KPI 2: Due Within 24 Hours */}
        <div className="p-5 bg-white rounded-lg border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-secondary uppercase tracking-wider">Due Within 24h</span>
            <div className="p-2 rounded-md bg-amber-50 text-warning">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-warning">
              {loading ? '—' : dueWithin24h.length}
            </div>
            <p className="text-[11px] text-secondary mt-1">
              Require urgent seller response
            </p>
          </div>
        </div>

        {/* KPI 3: Evidence Coverage Avg */}
        <div className="p-5 bg-white rounded-lg border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-secondary uppercase tracking-wider">Evidence Coverage</span>
            <div className="p-2 rounded-md bg-purple-50 text-purple-600">
              <FileCheck2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-foreground">
              {loading ? '—' : avgCoverage !== null ? `${avgCoverage}%` : 'N/A'}
            </div>
            <p className="text-[11px] text-secondary mt-1">
              Human verified / total requirements
            </p>
          </div>
        </div>

        {/* KPI 4: Resolved */}
        <div className="p-5 bg-white rounded-lg border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-secondary uppercase tracking-wider">Resolved Cases</span>
            <div className="p-2 rounded-md bg-emerald-50 text-success">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-foreground">
              {loading ? '—' : resolvedCases.length}
            </div>
            <p className="text-[11px] text-secondary mt-1">
              Closed or settled in Sandbox
            </p>
          </div>
        </div>
      </div>

      {/* Main Section: Priority Queue */}
      <div className="bg-white rounded-lg border border-border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-sm text-foreground">Active Case Queue</h2>
            <ProvenanceBadge origin="PAYPAL" />
          </div>
          <Link
            href="/disputes"
            className="text-xs font-semibold text-primary hover:text-primary-hover flex items-center gap-1"
          >
            <span>View all in Inbox</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="p-12 text-center text-secondary text-xs flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            <span>Loading cases from local database...</span>
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
            <p className="text-secondary mt-3">
              If tables are missing, ensure <code className="bg-slate-100 px-1 py-0.5 rounded">0001_init.sql</code> migration is applied in Supabase.
            </p>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && disputes.length === 0 && (
          <div className="p-12 text-center text-xs text-secondary space-y-3">
            <p className="font-medium text-foreground text-sm">No disputes synchronized yet</p>
            <p className="max-w-md mx-auto">
              Click &quot;Sync with PayPal Sandbox&quot; to pull your open test disputes from the PayPal Sandbox API.
            </p>
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 rounded-md hover:bg-blue-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Sync now</span>
            </button>
          </div>
        )}

        {/* Disputes Table */}
        {!loading && !error && disputes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] border-b border-border text-secondary font-medium">
                <tr>
                  <th className="py-3 px-4">Dispute ID</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Stage</th>
                  <th className="py-3 px-4">Seller Response Due</th>
                  <th className="py-3 px-4">Evidence Readiness</th>
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
                          className="text-primary hover:underline"
                        >
                          {dispute.paypal_dispute_id}
                        </Link>
                      </td>
                      <td className="py-3.5 px-4 text-foreground font-medium">
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
                          <div>
                            <span className="text-foreground font-medium">
                              {formatDateIST(dispute.seller_response_due_at)}
                            </span>
                            <span className="block text-[10px] text-secondary">
                              {formatTimeIST(dispute.seller_response_due_at)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-secondary italic">Not available</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {dispute.coverage?.available ? (
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-slate-200 rounded-full h-1.5 overflow-hidden">
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
                          <span className="text-[11px] text-secondary">No requirements</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Link
                          href={`/disputes/${dispute.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-primary hover:text-white hover:bg-primary border border-primary/30 rounded transition-colors"
                        >
                          <span>Open Case</span>
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
