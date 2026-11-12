'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileText,
  Info,
  Lock,
  RefreshCw,
  Shield,
  Truck,
} from 'lucide-react';
import { ProvenanceBadge } from '@/components/provenance-badge';

interface EvidencePacketProps {
  disputeId: string;         // internal Supabase UUID
  paypalDisputeId: string;   // PP-R-YYP-... string
  onPreviewReady?: () => void;
}

interface VerifiedMatch {
  matchId: string;
  documentId: string;
  documentFilename: string;
  documentMimeType: string;
  documentSizeBytes: number;
  documentProvenance: string;
  requirementType: string;    // e.g. PROOF_OF_FULFILLMENT
  confidence: number;
  carrier?: string;
  trackingNumber?: string;
  deliveryStatus?: string;
  recommendation: string;
  missingFields: string[];
  sourceReferences: Array<{ page: number; excerpt: string }>;
}

interface PreviewData {
  endpoint: string;
  method: string;
  inputJson: any;
  attachedFiles: Array<{
    fieldName: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    documentId: string;
    provenance: string;
    reviewStatus: string;
  }>;
  estimatedTotalBytes: number;
  warnings: string[];
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

export function EvidencePacket({ disputeId, paypalDisputeId }: EvidencePacketProps) {
  const [verifiedMatches, setVerifiedMatches] = useState<VerifiedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Notes edited by merchant — pre-filled only from verified facts, never claims delivery
  const [notes, setNotes] = useState('');

  // Preview state
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  async function loadVerifiedMatches() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/disputes/${disputeId}/evidence-packet`);
      const json = await res.json();
      if (json.success) {
        setVerifiedMatches(json.data.verifiedMatches);
        // Pre-fill notes from verified facts only — never claim delivery
        const autoNotes = buildSafeNotes(json.data.verifiedMatches);
        setNotes(autoNotes);
      } else {
        setError(json.error || 'Failed to load verified evidence');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadVerifiedMatches();
  }, [disputeId]);

  /** Build safe pre-filled notes from verified facts only. Never claims delivery. */
  function buildSafeNotes(matches: VerifiedMatch[]): string {
    if (matches.length === 0) return '';
    const lines: string[] = [];

    for (const m of matches) {
      if (m.requirementType === 'PROOF_OF_FULFILLMENT') {
        lines.push(`Evidence type: ${m.requirementType}.`);
        if (m.carrier && m.trackingNumber) {
          lines.push(`Shipment dispatched via ${m.carrier}, tracking: ${m.trackingNumber}.`);
        }
        if (m.deliveryStatus) {
          // Only include delivery status if it does not assert delivery
          const isDeliveryClaim = /deliver(ed|y)/i.test(m.deliveryStatus) && !/in transit|dispatched|shipped/i.test(m.deliveryStatus);
          if (!isDeliveryClaim) {
            lines.push(`Shipment status at time of evidence: ${m.deliveryStatus}.`);
          }
        }
        if (m.missingFields && m.missingFields.length > 0) {
          lines.push(`Note: Delivery confirmation is not available in this document set.`);
        }
      }
    }
    return lines.join(' ');
  }

  async function handlePreview() {
    if (verifiedMatches.length === 0) return;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreview(null);
    setShowPreview(false);

    try {
      const payload = {
        disputeId,
        paypalDisputeId,
        notes: notes.trim(),
        documentIds: verifiedMatches.map((m) => m.documentId),
      };

      const res = await fetch(`/api/disputes/${disputeId}/evidence-packet/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setPreview(json.data);
        setShowPreview(true);
      } else {
        setPreviewError(json.error || 'Preview failed');
      }
    } catch (e: any) {
      setPreviewError(e.message);
    } finally {
      setPreviewLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-xs text-secondary">
        <RefreshCw className="w-4 h-4 animate-spin text-primary" />
        Loading verified evidence…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Failed to load evidence packet</p>
          <p className="mt-0.5">{error}</p>
        </div>
      </div>
    );
  }

  const hasVerified = verifiedMatches.length > 0;
  const notesOverLimit = notes.length > 2000;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-sm text-foreground flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Evidence Submission Packet
          </h2>
          <p className="text-[11px] text-secondary mt-0.5">
            Only HUMAN_VERIFIED documents are eligible for submission. AI suggestions alone are not eligible.
          </p>
        </div>
        <button
          onClick={loadVerifiedMatches}
          className="p-1.5 text-secondary hover:text-foreground border border-border rounded-md hover:bg-slate-50"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Safety banner */}
      <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
        <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold">AI does not adjudicate.</span> Notes are pre-filled from
          verified facts only. A tracking number does not prove delivery. No claim of delivery has
          been made. Submission requires explicit human confirmation.
        </div>
      </div>

      {/* Verified matches list */}
      {!hasVerified ? (
        <div className="p-8 text-center rounded-lg border border-dashed border-border text-xs text-secondary space-y-2">
          <CheckCircle2 className="w-6 h-6 mx-auto text-slate-300" />
          <p className="font-medium text-foreground">No human-verified evidence yet</p>
          <p>
            Go to the <strong>Evidence Checklist &amp; Upload</strong> tab, upload your documents,
            run Gemini analysis, then confirm the AI match to verify evidence.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
            Human-Verified Documents ({verifiedMatches.length})
          </h3>

          {verifiedMatches.map((m) => (
            <div
              key={m.matchId}
              className="p-4 rounded-lg border border-green-200 bg-green-50/40 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <FileText className="w-3.5 h-3.5 text-green-700 shrink-0" />
                  <span className="font-semibold text-foreground">{m.documentFilename}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-800 border border-green-200">
                    HUMAN_VERIFIED
                  </span>
                  <ProvenanceBadge origin={m.documentProvenance as any} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-secondary block">Evidence Type</span>
                  <span className="font-mono font-semibold text-foreground">{m.requirementType}</span>
                </div>
                <div>
                  <span className="text-secondary block">Confidence</span>
                  <span className="font-semibold text-foreground">
                    {Math.round(m.confidence * 100)}%
                  </span>
                </div>
                {m.carrier && (
                  <div>
                    <span className="text-secondary block">Carrier</span>
                    <span className="font-mono text-foreground">{m.carrier}</span>
                  </div>
                )}
                {m.trackingNumber && (
                  <div>
                    <span className="text-secondary block">Tracking #</span>
                    <span className="font-mono text-foreground">{m.trackingNumber}</span>
                  </div>
                )}
              </div>

              {/* Delivery status — shown without claiming delivery */}
              {m.deliveryStatus && (
                <div className="text-[11px] p-2 rounded bg-white border border-border">
                  <span className="text-secondary">Shipment status (AI-extracted, source-cited): </span>
                  <span className="text-foreground font-medium">{m.deliveryStatus}</span>
                  {/deliver(ed|y)/i.test(m.deliveryStatus) && (
                    <span className="ml-2 text-amber-700 font-semibold">
                      ⚠ Note: A tracking number does not prove delivery.
                    </span>
                  )}
                </div>
              )}

              {/* Missing fields notice */}
              {m.missingFields.length > 0 && (
                <div className="text-[11px] text-amber-800 flex items-start gap-1.5">
                  <Info className="w-3 h-3 shrink-0 mt-0.5 text-amber-600" />
                  <span>
                    Missing from document:{' '}
                    <span className="font-mono">{m.missingFields.join(', ')}</span>
                  </span>
                </div>
              )}

              {/* Source references */}
              {m.sourceReferences.length > 0 && (
                <div className="text-[10px] space-y-0.5">
                  <span className="text-secondary font-semibold">AI source citations (page, excerpt):</span>
                  {m.sourceReferences.map((ref, i) => (
                    <div key={i} className="font-mono bg-white border border-slate-200 px-2 py-1 rounded">
                      p.{ref.page} — &ldquo;{ref.excerpt}&rdquo;
                    </div>
                  ))}
                </div>
              )}

              {/* Recommendation */}
              <div className="text-[11px] text-secondary italic border-t border-dashed border-green-200 pt-2">
                AI recommendation: {m.recommendation}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Notes editor */}
      {hasVerified && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-primary" />
              Submission Notes
            </label>
            <span className={`text-[10px] ${notesOverLimit ? 'text-red-600 font-bold' : 'text-secondary'}`}>
              {notes.length} / 2000
            </span>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder="Notes are pre-filled from verified facts. Edit as needed. Do not claim delivery."
            className={`w-full text-xs rounded-md border px-3 py-2 font-mono resize-y focus:outline-none focus:ring-1 focus:ring-primary ${
              notesOverLimit ? 'border-red-400 bg-red-50' : 'border-border bg-white'
            }`}
          />
          <p className="text-[10px] text-secondary">
            Pre-filled from HUMAN_VERIFIED AI extractions only. Notes must not claim delivery or guarantee
            outcomes. Max 2,000 characters.
          </p>
        </div>
      )}

      {/* Preview button */}
      {hasVerified && (
        <div className="flex items-center gap-3 pt-2 border-t border-border">
          <button
            onClick={handlePreview}
            disabled={previewLoading || notesOverLimit || notes.trim().length === 0}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {previewLoading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Eye className="w-3.5 h-3.5" />
            )}
            Preview Request (no submission)
          </button>
          <span className="text-[10px] text-secondary">
            Inspect the exact multipart request before any PayPal API call.
          </span>
        </div>
      )}

      {previewError && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{previewError}</span>
        </div>
      )}

      {/* Preview panel */}
      {showPreview && preview && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-blue-200 pb-3">
            <Eye className="w-4 h-4 text-blue-700" />
            <h3 className="text-xs font-bold text-blue-900 uppercase tracking-wider">
              Request Preview — NOT SENT
            </h3>
          </div>

          {/* Warnings */}
          {preview.warnings.length > 0 && (
            <div className="space-y-1.5">
              {preview.warnings.map((w, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 p-2.5 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-900"
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Endpoint */}
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-secondary uppercase tracking-wider">
              Endpoint
            </span>
            <div className="font-mono text-[11px] bg-slate-900 text-green-400 px-3 py-2 rounded break-all">
              {preview.method} {preview.endpoint}
            </div>
          </div>

          {/* Input JSON */}
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-secondary uppercase tracking-wider">
              Part: &quot;input&quot; (Content-Type: application/json)
            </span>
            <pre className="text-[11px] font-mono bg-slate-900 text-slate-100 px-3 py-3 rounded overflow-x-auto max-h-56">
              {JSON.stringify(preview.inputJson, null, 2)}
            </pre>
          </div>

          {/* Attached files */}
          <div className="space-y-2">
            <span className="text-[10px] font-semibold text-secondary uppercase tracking-wider">
              Attached Files ({preview.attachedFiles.length})
            </span>
            {preview.attachedFiles.length === 0 ? (
              <p className="text-xs text-secondary italic">No HUMAN_VERIFIED files eligible.</p>
            ) : (
              <div className="space-y-1.5">
                {preview.attachedFiles.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-white border border-border text-[11px]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-secondary">{f.fieldName}</span>
                      <FileText className="w-3 h-3 text-slate-400" />
                      <span className="font-medium text-foreground">{f.originalFilename}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-secondary">{formatBytes(f.sizeBytes)}</span>
                      <span className="font-mono text-secondary">{f.mimeType}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-800 border border-green-200">
                        {f.reviewStatus}
                      </span>
                    </div>
                  </div>
                ))}
                <div className="text-[10px] text-secondary text-right">
                  Total: {formatBytes(preview.estimatedTotalBytes)} (limit: 50 MB)
                </div>
              </div>
            )}
          </div>

          <div className="p-3 rounded bg-slate-100 border border-slate-200 text-[11px] text-secondary flex items-start gap-2">
            <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-500" />
            <span>
              This preview shows the exact request that will be sent. No PayPal API call has been made.
              Submission requires a separate explicit confirmation step (Stage C final).
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
