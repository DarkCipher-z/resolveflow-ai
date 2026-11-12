'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  FileCheck,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  ExternalLink,
  Shield,
  HelpCircle,
  ChevronRight,
  Eye,
  ArrowRight,
  Upload,
} from 'lucide-react';
import { ProvenanceBadge } from './provenance-badge';
import { DocumentUpload } from './document-upload';
import { formatDateTimeIST, formatDateIST } from '@/lib/dispute-helpers';

interface EvidenceRequirement {
  id: string;
  paypal_evidence_type: string;
  evidence_source: string;
  is_required: boolean;
  requirement_status: string;
}

interface DocumentItem {
  id: string;
  original_filename: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  sha256_hash: string;
  processing_status: string;
  uploaded_at: string;
  signedUrl?: string | null;
}

interface EvidenceMatch {
  id: string;
  document_id: string;
  requirement_id: string;
  ai_run_id: string;
  match_confidence: number;
  supporting_excerpt: string;
  page_number: number;
  ai_explanation: string;
  review_status: 'AI_SUGGESTED' | 'HUMAN_VERIFIED' | 'REJECTED';
  reviewed_at?: string;
  ai_runs?: {
    output: any;
    validation_status: string;
    model_name: string;
  };
}

interface EvidenceIntelligenceProps {
  disputeId: string;
  onCoverageUpdated?: () => void;
}

export function EvidenceIntelligence({ disputeId, onCoverageUpdated }: EvidenceIntelligenceProps) {
  const [requirements, setRequirements] = useState<EvidenceRequirement[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [matches, setMatches] = useState<EvidenceMatch[]>([]);
  const [aiRuns, setAiRuns] = useState<any[]>([]);
  const [coverage, setCoverage] = useState<{ numerator: number; denominator: number; percent: number; available: boolean }>({
    numerator: 0,
    denominator: 0,
    percent: 0,
    available: false,
  });

  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzingDocId, setAnalyzingDocId] = useState<string | null>(null);
  const [reviewingMatchId, setReviewingMatchId] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/disputes/${disputeId}`);
      const json = await res.json();

      if (json.success) {
        const d = json.data;
        setRequirements(d.evidence_requirements || []);
        setDocuments(d.documents || []);
        setMatches(d.evidence_matches || []);
        if (d.coverage) setCoverage(d.coverage);

        // Auto-select first document if none selected
        if (!selectedDocId && d.documents && d.documents.length > 0) {
          setSelectedDocId(d.documents[0].id);
        }
      }
    } catch (e: any) {
      console.error('Failed to load evidence data:', e);
    } finally {
      setLoading(false);
    }
  }, [disputeId, selectedDocId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleAnalyze(docId: string) {
    try {
      setAnalyzingDocId(docId);
      setFeedbackMessage(null);

      const res = await fetch(`/api/disputes/${disputeId}/documents/${docId}/analyze`, {
        method: 'POST',
      });
      const json = await res.json();

      if (json.success) {
        setFeedbackMessage({
          type: 'success',
          text: `Gemini analyzed document: ${json.data.analysis.parsed?.recommendation || 'Extracted fields successfully.'}`,
        });
        setSelectedDocId(docId);
        await loadData();
        onCoverageUpdated?.();
      } else {
        setFeedbackMessage({
          type: 'error',
          text: `Analysis failed: ${json.error || 'Schema validation failure'}`,
        });
        await loadData();
      }
    } catch (e: any) {
      setFeedbackMessage({
        type: 'error',
        text: `Analysis error: ${e.message}`,
      });
    } finally {
      setAnalyzingDocId(null);
    }
  }

  async function handleReviewMatch(matchId: string, action: 'CONFIRM' | 'REJECT') {
    try {
      setReviewingMatchId(matchId);
      setFeedbackMessage(null);

      const res = await fetch(`/api/disputes/${disputeId}/matches/${matchId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();

      if (json.success) {
        setFeedbackMessage({
          type: 'success',
          text: action === 'CONFIRM' ? 'Match verified by human. Requirement updated.' : 'Candidate match rejected.',
        });
        await loadData();
        onCoverageUpdated?.();
      } else {
        setFeedbackMessage({
          type: 'error',
          text: `Review failed: ${json.error}`,
        });
      }
    } catch (e: any) {
      setFeedbackMessage({
        type: 'error',
        text: `Review error: ${e.message}`,
      });
    } finally {
      setReviewingMatchId(null);
    }
  }

  // Active document data
  const activeDocument = documents.find((d) => d.id === selectedDocId);
  const activeMatch = matches.find((m) => m.document_id === selectedDocId);

  return (
    <div className="space-y-6">
      {/* Top Banner: Evidence Intelligence Header & Coverage KPI */}
      <div className="bg-white rounded-lg border border-border p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span>Evidence Intelligence & Matching</span>
            </h2>
            <ProvenanceBadge origin="AI" />
          </div>
          <p className="text-xs text-secondary mt-1 max-w-xl">
            Gemini reads native PDF/image evidence, checks fulfillment claims, cross-references with PayPal requested requirements, and prepares source-backed match recommendations for human review.
          </p>
        </div>

        {/* Coverage Counter */}
        <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-lg flex items-center gap-4 shrink-0">
          <div>
            <span className="text-[10px] uppercase font-bold text-secondary tracking-wider block">
              Human-Verified Coverage
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              {coverage.available ? (
                <>
                  <span className="text-2xl font-bold text-primary">
                    {coverage.numerator}/{coverage.denominator}
                  </span>
                  <span className="text-xs font-semibold text-slate-700">
                    ({coverage.percent}%)
                  </span>
                </>
              ) : (
                <span className="text-sm font-semibold text-secondary italic">
                  Not available
                </span>
              )}
            </div>
            <p className="text-[10px] text-secondary mt-0.5">
              Only HUMAN_VERIFIED items count toward coverage
            </p>
          </div>
        </div>
      </div>

      {/* Status / Feedback message */}
      {feedbackMessage && (
        <div
          className={`p-3 rounded-md text-xs flex items-start justify-between gap-2 ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-start gap-2">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="text-slate-400 hover:text-slate-700 font-bold px-1"
          >
            &times;
          </button>
        </div>
      )}

      {/* 3-Pane Intelligence Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* PANE 1 (3 cols): PayPal Requirements */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white rounded-lg border border-border p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <h3 className="font-semibold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <FileCheck className="w-3.5 h-3.5 text-primary" />
                <span>1. Requirements</span>
              </h3>
              <ProvenanceBadge origin="PAYPAL" />
            </div>

            {requirements.length === 0 ? (
              <p className="text-xs text-secondary italic">No requirements on this dispute.</p>
            ) : (
              <div className="space-y-2.5">
                {requirements.map((req) => {
                  const reqMatches = matches.filter((m) => m.requirement_id === req.id);
                  const isVerified = req.requirement_status === 'HUMAN_VERIFIED';
                  const hasCandidate = req.requirement_status === 'CANDIDATE_FOUND';

                  return (
                    <div
                      key={req.id}
                      className={`p-3 rounded-md border text-xs transition-colors ${
                        isVerified
                          ? 'border-emerald-300 bg-emerald-50/40'
                          : hasCandidate
                          ? 'border-amber-300 bg-amber-50/40'
                          : 'border-border bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-foreground text-[11px]">
                          {req.paypal_evidence_type}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            isVerified
                              ? 'bg-emerald-100 text-emerald-800'
                              : hasCandidate
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {req.requirement_status}
                        </span>
                      </div>

                      <div className="mt-2 text-[10px] text-secondary flex items-center justify-between">
                        <span>Source: {req.evidence_source}</span>
                        <span>{reqMatches.length} candidate(s)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* PANE 2 (4 cols): Documents & Upload */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-lg border border-border p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <h3 className="font-semibold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-primary" />
                <span>2. Documents</span>
              </h3>
              <ProvenanceBadge origin="MERCHANT" />
            </div>

            {/* Document list */}
            {documents.length === 0 ? (
              <p className="text-xs text-secondary italic">No documents uploaded yet.</p>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => {
                  const isSelected = doc.id === selectedDocId;
                  const isAnalyzing = doc.id === analyzingDocId;
                  const docMatch = matches.find((m) => m.document_id === doc.id);

                  return (
                    <div
                      key={doc.id}
                      onClick={() => setSelectedDocId(doc.id)}
                      className={`p-3 rounded-md border text-xs cursor-pointer transition-all ${
                        isSelected
                          ? 'border-primary bg-blue-50/40 ring-1 ring-primary/30'
                          : 'border-border bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate max-w-[180px]">
                            {doc.original_filename}
                          </p>
                          <p className="text-[10px] text-secondary mt-0.5">
                            {formatDateIST(doc.uploaded_at)} &bull; {Math.round(doc.size_bytes / 1024)} KB
                          </p>
                        </div>

                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                            doc.processing_status === 'DONE'
                              ? 'bg-blue-100 text-blue-800'
                              : doc.processing_status === 'FAILED'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {doc.processing_status}
                        </span>
                      </div>

                      {/* Action row */}
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                        {doc.signedUrl && (
                          <a
                            href={doc.signedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-primary hover:underline flex items-center gap-1"
                          >
                            <span>Preview</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAnalyze(doc.id);
                          }}
                          disabled={isAnalyzing}
                          className="px-2 py-0.5 rounded bg-primary text-white font-semibold text-[10px] hover:bg-primary-hover transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                          <Sparkles className={`w-2.5 h-2.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
                          <span>
                            {isAnalyzing
                              ? 'Analyzing...'
                              : doc.processing_status === 'FAILED'
                              ? 'Retry Analysis'
                              : doc.processing_status === 'DONE'
                              ? 'Re-analyze'
                              : 'Analyze with Gemini'}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Upload Accordion */}
          <DocumentUpload disputeId={disputeId} />
        </div>

        {/* PANE 3 (5 cols): AI Extraction & Human Review */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-lg border border-border p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-semibold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>3. Extraction & Human Verification</span>
              </h3>
              <ProvenanceBadge origin="AI" />
            </div>

            {!activeDocument ? (
              <div className="p-8 text-center text-xs text-secondary">
                <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p>Select a document from the left to view Gemini extraction results.</p>
              </div>
            ) : analyzingDocId === activeDocument.id ? (
              <div className="p-12 text-center text-xs text-secondary flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                <p className="font-semibold text-foreground">Gemini is analyzing document binary...</p>
                <p className="text-[11px] max-w-xs">
                  Running multimodal extraction, verifying delivery claims, and matching against PayPal evidence requirements.
                </p>
              </div>
            ) : activeDocument.processing_status === 'FAILED' ? (
              <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-xs space-y-3">
                <div className="flex items-start gap-2 text-critical font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Analysis or Schema Validation Failed</span>
                </div>
                <p className="text-secondary text-[11px]">
                  The Gemini response failed validation or encountered an error. Click below to retry.
                </p>
                <button
                  onClick={() => handleAnalyze(activeDocument.id)}
                  className="px-3 py-1.5 bg-critical text-white rounded font-semibold text-xs hover:opacity-90"
                >
                  Retry Analysis
                </button>
              </div>
            ) : !activeMatch ? (
              <div className="p-8 text-center text-xs text-secondary space-y-3">
                <HelpCircle className="w-8 h-8 text-slate-300 mx-auto mb-1" />
                <p className="font-semibold text-foreground">No analysis run yet on this document</p>
                <p className="text-[11px] max-w-xs mx-auto">
                  Click &quot;Analyze with Gemini&quot; on the document card to classify fields and match against dispute evidence requirements.
                </p>
                <button
                  onClick={() => handleAnalyze(activeDocument.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded font-semibold text-xs hover:bg-primary-hover shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Analyze with Gemini</span>
                </button>
              </div>
            ) : (
              /* ACTIVE EXTRACTION & REVIEW CARD */
              <div className="space-y-4 text-xs">
                {/* Match Status Banner */}
                <div
                  className={`p-3 rounded-lg border flex items-center justify-between ${
                    activeMatch.review_status === 'HUMAN_VERIFIED'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : activeMatch.review_status === 'REJECTED'
                      ? 'bg-slate-100 border-slate-200 text-slate-700'
                      : 'bg-purple-50 border-purple-200 text-purple-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold uppercase tracking-wider text-[11px]">
                      {activeMatch.review_status === 'HUMAN_VERIFIED'
                        ? 'Human Verified'
                        : activeMatch.review_status === 'REJECTED'
                        ? 'Candidate Rejected'
                        : 'AI Suggested Candidate'}
                    </span>
                    <ProvenanceBadge
                      origin={
                        activeMatch.review_status === 'HUMAN_VERIFIED'
                          ? 'HUMAN_VERIFIED'
                          : 'AI'
                      }
                    />
                  </div>

                  <span className="font-mono text-xs font-bold">
                    Confidence: {Math.round(activeMatch.match_confidence * 100)}%
                  </span>
                </div>

                {/* Recommendation / Summary */}
                <div className="p-3 bg-slate-50 border border-border rounded-lg space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-secondary block">
                    AI Factual Assessment
                  </span>
                  <p className="text-foreground text-xs leading-relaxed">
                    {activeMatch.ai_explanation}
                  </p>
                </div>

                {/* Source Excerpt */}
                {activeMatch.supporting_excerpt && (
                  <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                      <span>Source Quote (Verbatim)</span>
                      <span>Page {activeMatch.page_number}</span>
                    </div>
                    <blockquote className="italic text-foreground text-xs font-serif border-l-2 border-amber-400 pl-2">
                      &ldquo;{activeMatch.supporting_excerpt}&rdquo;
                    </blockquote>
                  </div>
                )}

                {/* Missing fields callout (Crucial for INR) */}
                {activeMatch.ai_runs?.output?.missing_fields &&
                  activeMatch.ai_runs.output.missing_fields.length > 0 && (
                    <div className="p-3 bg-red-50/60 border border-red-200 rounded-lg space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-critical block">
                        Missing Required Proof
                      </span>
                      <ul className="list-disc list-inside text-[11px] text-red-900 space-y-0.5">
                        {activeMatch.ai_runs.output.missing_fields.map((mf: string, idx: number) => (
                          <li key={idx} className="font-medium">
                            {mf}
                          </li>
                        ))}
                      </ul>
                      <p className="text-[10px] text-secondary italic mt-1">
                        Reminder: A tracking number or shipping slip proves dispatch, NOT delivery.
                      </p>
                    </div>
                  )}

                {/* Contradictions if any */}
                {activeMatch.ai_runs?.output?.contradictions &&
                  activeMatch.ai_runs.output.contradictions.length > 0 && (
                    <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-orange-900 block">
                        Contradictions Detected
                      </span>
                      <ul className="list-disc list-inside text-[11px] text-orange-950 space-y-0.5">
                        {activeMatch.ai_runs.output.contradictions.map((c: string, idx: number) => (
                          <li key={idx}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                {/* Extracted Fields Table */}
                {activeMatch.ai_runs?.output?.extracted_fields && (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-border text-[10px] uppercase font-bold text-secondary">
                        <tr>
                          <th className="py-2 px-3">Field</th>
                          <th className="py-2 px-3">Extracted Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border text-[11px]">
                        {Object.entries(activeMatch.ai_runs.output.extracted_fields).map(([k, v]) => (
                          <tr key={k}>
                            <td className="py-1.5 px-3 font-mono text-secondary">{k}</td>
                            <td className="py-1.5 px-3 font-semibold text-foreground">
                              {v ? String(v) : <span className="text-slate-400 italic">null</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* HUMAN CONFIRM / REJECT ACTION BAR */}
                <div className="pt-3 border-t border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      Human Adjudication Decision:
                    </span>
                    {activeMatch.review_status === 'HUMAN_VERIFIED' && (
                      <span className="text-[11px] text-success font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Verified {formatDateIST(activeMatch.reviewed_at)}</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleReviewMatch(activeMatch.id, 'CONFIRM')}
                      disabled={reviewingMatchId === activeMatch.id || activeMatch.review_status === 'HUMAN_VERIFIED'}
                      className={`flex-1 py-2 px-3 rounded text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
                        activeMatch.review_status === 'HUMAN_VERIFIED'
                          ? 'bg-emerald-100 text-emerald-800 cursor-default'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{activeMatch.review_status === 'HUMAN_VERIFIED' ? 'Verified (Active)' : 'Confirm Match'}</span>
                    </button>

                    <button
                      onClick={() => handleReviewMatch(activeMatch.id, 'REJECT')}
                      disabled={reviewingMatchId === activeMatch.id || activeMatch.review_status === 'REJECTED'}
                      className={`py-2 px-3 rounded text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                        activeMatch.review_status === 'REJECTED'
                          ? 'bg-slate-200 text-slate-700 cursor-default'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
                      }`}
                    >
                      <XCircle className="w-4 h-4" />
                      <span>{activeMatch.review_status === 'REJECTED' ? 'Rejected' : 'Reject'}</span>
                    </button>
                  </div>

                  <p className="text-[10px] text-secondary text-center">
                    Confirmatory action writes an audit_logs row and updates the case coverage metric.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
