'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Trash2,
  FileCheck,
  Shield,
} from 'lucide-react';
import { ProvenanceBadge } from './provenance-badge';
import { formatDateTimeIST } from '@/lib/dispute-helpers';

interface DocumentRecord {
  id: string;
  original_filename: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  sha256_hash: string;
  source_type: string;
  processing_status: string;
  uploaded_at: string;
  signedUrl?: string | null;
}

interface DocumentUploadProps {
  disputeId: string;
}

const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'gif'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_BATCH_SIZE = 50 * 1024 * 1024; // 50MB

export function DocumentUpload({ disputeId }: DocumentUploadProps) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/disputes/${disputeId}/documents`);
      const json = await res.json();
      if (json.success) {
        setDocuments(json.data || []);
      }
    } catch (e: any) {
      console.error('Failed to load documents:', e);
    } finally {
      setLoading(false);
    }
  }, [disputeId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  function validateFiles(files: File[]): string | null {
    if (files.length === 0) return 'Please select at least one file.';

    let totalSize = 0;
    for (const f of files) {
      totalSize += f.size;
      const ext = f.name.split('.').pop()?.toLowerCase();
      if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
        return `File "${f.name}" has an unsupported format. Only PDF, JPG, PNG, and GIF files are allowed.`;
      }
      if (f.size > MAX_FILE_SIZE) {
        return `File "${f.name}" exceeds the 10 MB per-file limit (${(f.size / (1024 * 1024)).toFixed(1)} MB).`;
      }
      if (f.size === 0) {
        return `File "${f.name}" is empty.`;
      }
    }

    if (totalSize > MAX_BATCH_SIZE) {
      return `Total batch size exceeds 50 MB (${(totalSize / (1024 * 1024)).toFixed(1)} MB).`;
    }

    return null;
  }

  async function handleFiles(files: File[]) {
    setErrorMessage(null);
    setSuccessMessage(null);

    const validationError = validateFiles(files);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}...`);

      const formData = new FormData();
      for (const f of files) {
        formData.append('files', f);
      }

      const res = await fetch(`/api/disputes/${disputeId}/documents`, {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();

      if (json.success) {
        setSuccessMessage(`Successfully uploaded ${json.data.length} document(s).`);
        await fetchDocuments();
      } else {
        setErrorMessage(json.error || 'Upload failed');
      }
    } catch (e: any) {
      setErrorMessage(`Upload error: ${e.message}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      handleFiles(filesArray);
    }
  }

  function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      handleFiles(filesArray);
    }
  }

  function formatBytes(bytes: number) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  return (
    <div className="space-y-5">
      {/* Upload Zone Card */}
      <div className="bg-white rounded-lg border border-border p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="font-semibold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5 text-primary" />
              <span>Upload Merchant Evidence</span>
            </h3>
            <p className="text-[11px] text-secondary mt-0.5">
              Securely upload invoices, tracking records, or communications. Files are stored in private encrypted storage.
            </p>
          </div>
          <ProvenanceBadge origin="MERCHANT" />
        </div>

        {/* Drag and drop box */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
            isDragOver
              ? 'border-primary bg-blue-50/60 ring-2 ring-primary/20'
              : 'border-slate-200 hover:border-primary/50 hover:bg-slate-50/60'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.gif"
            onChange={onFileSelect}
            className="hidden"
          />

          <div className="flex flex-col items-center justify-center gap-2">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-primary">
              {isUploading ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <Upload className="w-5 h-5" />
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-foreground">
                {isUploading ? uploadProgress : 'Click to browse or drag & drop files here'}
              </p>
              <p className="text-[11px] text-secondary mt-0.5">
                Supported: PDF, JPG, PNG, GIF &bull; Max 10 MB per file (50 MB total)
              </p>
            </div>
          </div>
        </div>

        {/* Messages */}
        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-critical flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-slate-400 hover:text-slate-700 font-bold px-1"
            >
              &times;
            </button>
          </div>
        )}

        {successMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-success flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-slate-400 hover:text-slate-700 font-bold px-1"
            >
              &times;
            </button>
          </div>
        )}
      </div>

      {/* Uploaded Documents List */}
      <div className="bg-white rounded-lg border border-border p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <FileCheck className="w-3.5 h-3.5 text-primary" />
              <span>Uploaded Evidence Documents</span>
            </h3>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
              {documents.length}
            </span>
          </div>

          <button
            onClick={fetchDocuments}
            className="text-xs text-secondary hover:text-foreground flex items-center gap-1"
            title="Refresh documents list"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="p-8 text-center text-xs text-secondary flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-primary" />
            <span>Loading documents...</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && documents.length === 0 && (
          <div className="p-8 text-center text-xs text-secondary space-y-1">
            <FileText className="w-8 h-8 text-slate-300 mx-auto mb-1" />
            <p className="font-medium text-foreground">No evidence documents uploaded yet</p>
            <p className="text-[11px]">
              Upload order confirmation, shipping slips, or customer communications to build your evidence packet.
            </p>
          </div>
        )}

        {/* Documents table / list */}
        {!loading && documents.length > 0 && (
          <div className="divide-y divide-border">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 p-2 rounded transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="p-2 rounded bg-blue-50 text-primary shrink-0 mt-0.5">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-semibold text-foreground truncate max-w-xs sm:max-w-md">
                        {doc.original_filename}
                      </p>
                      <ProvenanceBadge origin="MERCHANT" />
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-secondary mt-1 flex-wrap">
                      <span>Size: {formatBytes(doc.size_bytes)}</span>
                      <span>&bull;</span>
                      <span>Format: {doc.mime_type.split('/')[1]?.toUpperCase()}</span>
                      <span>&bull;</span>
                      <span>Uploaded: {formatDateTimeIST(doc.uploaded_at)}</span>
                    </div>

                    <p className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">
                      SHA-256: {doc.sha256_hash}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                    {doc.processing_status}
                  </span>

                  {doc.signedUrl ? (
                    <a
                      href={doc.signedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-primary hover:text-white hover:bg-primary border border-primary/30 rounded transition-colors"
                      title="View / Download securely via signed URL"
                    >
                      <span>View</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-[10px] text-secondary italic">URL expired</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
