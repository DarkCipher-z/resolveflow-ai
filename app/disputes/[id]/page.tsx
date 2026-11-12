'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  FileCheck,
  FileText,
  HelpCircle,
  Lock,
  RefreshCw,
  Send,
  Shield,
  ShieldAlert,
  Upload,
  User,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { ProvenanceBadge } from '@/components/provenance-badge';
import { DeadlineBadge } from '@/components/deadline-badge';
import { DocumentUpload } from '@/components/document-upload';
import { EvidenceIntelligence } from '@/components/evidence-intelligence';
import {
  formatDisputeReason,
  formatDisputeStatus,
  formatLifecycleStage,
  formatDateIST,
  formatTimeIST,
  formatDateTimeIST,
} from '@/lib/dispute-helpers';

export default function DisputeWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [dispute, setDispute] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'EVIDENCE' | 'TIMELINE'>('OVERVIEW');

  async function loadDispute() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/disputes/${id}`);
      const json = await res.json();
      if (json.success) {
        setDispute(json.data);
      } else {
        setError(json.error);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDispute();
  }, [id]);

  if (loading) {
    return (
      <div className="p-16 text-center text-xs flex flex-col items-center justify-center gap-3">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        <span>Loading case workspace...</span>
      </div>
    );
  }

  if (error || !dispute) {
    return (
      <div className="p-8 text-center text-xs">
        <AlertTriangle className="w-8 h-8 text-critical mx-auto mb-2" />
        <p className="font-semibold text-critical">Failed to load dispute workspace</p>
        <p className="text-secondary mt-1">{error || 'Dispute not found'}</p>
        <Link
          href="/disputes"
          className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-primary font-medium hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Inbox</span>
        </Link>
      </div>
    );
  }

  const requirements = dispute.evidence_requirements || [];
  const allowedActions = dispute.allowedActions || [];
  
  // Extract raw transactions from PayPal snapshot if available, else from transactions table
  const snapshotTransactions = dispute.paypal_snapshot?.disputed_transactions || [];
  const dbTransactions = dispute.transactions || [];

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Link
            href="/disputes"
            className="p-1.5 rounded-md hover:bg-slate-200 text-secondary hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold font-mono tracking-tight text-foreground">
                {dispute.paypal_dispute_id}
              </h1>
              <ProvenanceBadge origin="PAYPAL" />
            </div>
            <p className="text-xs text-secondary mt-0.5">
              Reason: <strong className="text-foreground">{formatDisputeReason(dispute.reason)}</strong> &bull; Stage:{' '}
              {formatLifecycleStage(dispute.lifecycle_stage)}
            </p>
          </div>
        </div>

        {/* Status Pill & Refresh */}
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            <span>{formatDisputeStatus(dispute.status)}</span>
          </div>

          <button
            onClick={loadDispute}
            className="p-2 text-secondary hover:text-foreground border border-border rounded-md hover:bg-slate-50 transition-colors"
            title="Refresh case details"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab('OVERVIEW')}
          className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'OVERVIEW'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-secondary hover:text-foreground'
          }`}
        >
          Case Facts & Overview
        </button>
        <button
          onClick={() => setActiveTab('EVIDENCE')}
          className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'EVIDENCE'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-secondary hover:text-foreground'
          }`}
        >
          <span>Evidence Checklist & Upload</span>
          <span className="px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">
            {requirements.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('TIMELINE')}
          className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'TIMELINE'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-secondary hover:text-foreground'
          }`}
        >
          Raw PayPal Snapshot & Audit
        </button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'OVERVIEW' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (4 cols): Case Facts & Transactions */}
          <div className="lg:col-span-4 space-y-5">
            {/* Case Facts Card */}
            <div className="bg-white rounded-lg border border-border p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h2 className="font-semibold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-primary" />
                  <span>Case Facts</span>
                </h2>
                <ProvenanceBadge origin="PAYPAL" />
              </div>

              <dl className="space-y-3 text-xs">
                <div>
                  <dt className="text-secondary font-medium">Dispute Amount</dt>
                  <dd className="text-lg font-bold text-foreground mt-0.5">
                    {dispute.currency_code} {Number(dispute.amount).toFixed(2)}
                  </dd>
                </div>

                <div>
                  <dt className="text-secondary font-medium">Reason Code</dt>
                  <dd className="font-mono text-slate-700 bg-slate-50 p-1.5 rounded border border-slate-200 mt-1 break-all">
                    {dispute.reason}
                  </dd>
                </div>

                <div>
                  <dt className="text-secondary font-medium">Response Deadline</dt>
                  <dd className="mt-1 flex items-center gap-1.5 flex-wrap text-foreground font-medium">
                    <Clock className="w-3.5 h-3.5 text-warning shrink-0" />
                    {dispute.seller_response_due_at ? (
                      <>
                        <span>{formatDateTimeIST(dispute.seller_response_due_at)}</span>
                        <DeadlineBadge dueDate={dispute.seller_response_due_at} />
                      </>
                    ) : (
                      <>
                        <span className="text-secondary italic">Not available</span>
                        <DeadlineBadge dueDate={null} />
                      </>
                    )}
                  </dd>
                </div>

                <div>
                  <dt className="text-secondary font-medium">Lifecycle Stage</dt>
                  <dd className="font-medium text-foreground mt-0.5">
                    {formatLifecycleStage(dispute.lifecycle_stage)}
                  </dd>
                </div>

                <div>
                  <dt className="text-secondary font-medium">Dispute Status</dt>
                  <dd className="font-medium text-foreground mt-0.5">
                    {formatDisputeStatus(dispute.status)}
                  </dd>
                </div>

                <div>
                  <dt className="text-secondary font-medium">Last Synced</dt>
                  <dd className="text-secondary mt-0.5">
                    {dispute.last_synced_at ? formatDateTimeIST(dispute.last_synced_at) : '—'}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Disputed Transactions Card (UI Fix 3: separate labelled fields exactly as API returns) */}
            <div className="bg-white rounded-lg border border-border p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <h3 className="font-semibold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-primary" />
                  <span>Disputed Transactions</span>
                </h3>
                <ProvenanceBadge origin="PAYPAL" />
              </div>

              {(() => {
                const txList = snapshotTransactions.length > 0
                  ? snapshotTransactions
                  : dbTransactions.map((t: any) => t.source_payload || t);

                if (txList.length === 0) {
                  return (
                    <p className="text-xs text-secondary italic">
                      No disputed transactions returned in snapshot.
                    </p>
                  );
                }

                return (
                  <div className="space-y-3">
                    {txList.map((tx: any, idx: number) => (
                      <div key={idx} className="p-3 bg-slate-50 rounded-md border border-border text-xs space-y-2">
                        <div>
                          <span className="text-[10px] uppercase font-semibold text-secondary tracking-wider block">
                            seller_transaction_id
                          </span>
                          <span className="font-mono font-bold text-foreground break-all">
                            {tx.seller_transaction_id || tx.paypal_transaction_reference || '(not returned by API)'}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] uppercase font-semibold text-secondary tracking-wider block">
                            buyer_transaction_id
                          </span>
                          <span className="font-mono font-bold text-foreground break-all">
                            {tx.buyer_transaction_id || '(not returned by API)'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-secondary pt-1.5 border-t border-slate-200 text-[11px]">
                          <span>
                            Gross: <strong className="text-foreground">{tx.gross_amount?.currency_code || tx.currency_code || 'USD'} {tx.gross_amount?.value || tx.amount}</strong>
                          </span>
                          {(tx.create_time || tx.transaction_at) && (
                            <span>{formatDateIST(tx.create_time || tx.transaction_at)}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Middle Column (5 cols): Requested Evidence Checklist */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-white rounded-lg border border-border p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h2 className="font-semibold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <FileCheck className="w-3.5 h-3.5 text-primary" />
                    <span>Requested Evidence Checklist</span>
                  </h2>
                  <p className="text-[11px] text-secondary mt-0.5">
                    Authoritative requirements requested by PayPal for this case.
                  </p>
                </div>
                <ProvenanceBadge origin="PAYPAL" />
              </div>

              {/* Coverage Summary */}
              <div className="p-3 bg-blue-50/50 rounded-md border border-blue-100 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">Evidence Coverage</span>
                {dispute.coverage?.available ? (
                  <span className="font-bold text-primary">
                    {dispute.coverage.numerator} of {dispute.coverage.denominator} Verified ({dispute.coverage.percent}%)
                  </span>
                ) : (
                  <span className="text-secondary">Not available</span>
                )}
              </div>

              {/* Checklist Items */}
              {requirements.length === 0 ? (
                <div className="p-6 text-center text-xs text-secondary">
                  <HelpCircle className="w-6 h-6 mx-auto text-slate-300 mb-1" />
                  <p>No explicit evidence items requested on this dispute.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {requirements.map((req: any) => (
                    <div
                      key={req.id}
                      className="p-4 rounded-md border border-border bg-white hover:border-primary/40 transition-colors space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                          <h4 className="font-mono text-xs font-bold text-foreground">
                            {req.paypal_evidence_type}
                          </h4>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                          {req.requirement_status}
                        </span>
                      </div>

                      <p className="text-[11px] text-secondary">
                        Source:{' '}
                        <strong className="text-foreground font-mono">{req.evidence_source}</strong>
                      </p>

                      <div className="pt-2 border-t border-dashed border-slate-200 flex items-center justify-between text-[11px]">
                        <span className="text-secondary">Upload supporting evidence</span>
                        <button
                          onClick={() => setActiveTab('EVIDENCE')}
                          className="text-primary font-semibold hover:underline"
                        >
                          Upload Document &rarr;
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column (3 cols): Live Allowed Actions (UI Fix 4) */}
          <div className="lg:col-span-3 space-y-5">
            <div className="bg-white rounded-lg border border-border p-5 shadow-sm space-y-4">
              <div className="border-b border-border pb-3">
                <h2 className="font-semibold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-primary" />
                  <span>Allowed Actions</span>
                </h2>
                <p className="text-[10px] text-secondary mt-0.5">
                  Derived from live HATEOAS links and allowed response options.
                </p>
              </div>

              {allowedActions.length === 0 ? (
                <p className="text-xs text-secondary italic">
                  No active actions permitted by PayPal for this case stage.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {allowedActions.map((action: any) => (
                    <div
                      key={action.id}
                      className="p-3 rounded-md border border-border bg-slate-50 flex flex-col gap-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-foreground">
                          {action.label}
                        </span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                          {action.method}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-secondary">
                          via: {action.source}
                        </span>

                        {action.id === 'PROVIDE_EVIDENCE' ? (
                          <button
                            onClick={() => setActiveTab('EVIDENCE')}
                            className="px-2.5 py-1 text-[11px] font-semibold text-white bg-primary hover:bg-primary-hover rounded shadow-sm transition-colors cursor-pointer"
                            title="Open evidence workspace to review or submit"
                          >
                            Submit Evidence
                          </button>
                        ) : (
                          <span className="text-[10px] text-secondary italic">
                            Available in PayPal (not used in this MVP)
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Non-negotiable safety notice */}
              <div className="p-3 rounded-md bg-amber-50/80 border border-amber-200 text-[10px] text-amber-900 space-y-1">
                <div className="flex items-center gap-1 font-semibold text-amber-800">
                  <Lock className="w-3 h-3 text-amber-700" />
                  <span>Human Approval Rule</span>
                </div>
                <p>
                  No PayPal action can execute autonomously. All submissions require human verification and explicit confirmation.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: EVIDENCE CHECKLIST & UPLOAD (Phase 2) */}
      {activeTab === 'EVIDENCE' && (
        <div className="space-y-6">
          <EvidenceIntelligence disputeId={dispute.id} onCoverageUpdated={loadDispute} />
        </div>
      )}

      {/* TAB 3: TIMELINE & SNAPSHOT */}
      {activeTab === 'TIMELINE' && (
        <div className="bg-white rounded-lg border border-border p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h2 className="font-semibold text-sm text-foreground flex items-center gap-2">
                <Info className="w-4 h-4 text-primary" />
                <span>Raw PayPal Authoritative Snapshot</span>
              </h2>
              <p className="text-xs text-secondary mt-0.5">
                Exact payload retrieved from PayPal Disputes API endpoint for this dispute.
              </p>
            </div>
            <ProvenanceBadge origin="PAYPAL" />
          </div>

          <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto max-h-[500px]">
            {JSON.stringify(dispute.paypal_snapshot, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
