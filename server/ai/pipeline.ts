import { supabaseAdmin } from '../supabase/admin';
import { analyzeDocument, AnalyzeDocumentResult } from './extractor';
import { PROMPT_VERSION } from './prompts';

const STORAGE_BUCKET = 'evidence';

export interface PipelineExecutionResult {
  success: boolean;
  aiRunId: string;
  documentId: string;
  disputeId: string;
  analysis: AnalyzeDocumentResult;
  matchCreated: boolean;
  matchId?: string;
  error?: string;
}

/**
 * Runs the Gemini document intelligence pipeline for a specific document and dispute.
 * Reads the file binary from Supabase storage, runs multimodal extraction,
 * records the ai_runs row, and links candidates in evidence_matches.
 */
export async function runDocumentAnalysisPipeline(
  documentId: string,
  disputeId: string
): Promise<PipelineExecutionResult> {
  // 1. Fetch document record
  const { data: document, error: docError } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (docError || !document) {
    throw new Error(`Document not found: ${docError?.message || documentId}`);
  }

  // 2. Fetch dispute record
  const { data: dispute, error: disputeError } = await supabaseAdmin
    .from('disputes')
    .select('*, evidence_requirements (*)')
    .eq('id', disputeId)
    .single();

  if (disputeError || !dispute) {
    throw new Error(`Dispute not found: ${disputeError?.message || disputeId}`);
  }

  // 3. Mark document as PROCESSING
  await supabaseAdmin
    .from('documents')
    .update({ processing_status: 'PROCESSING' })
    .eq('id', documentId);

  // 4. Download file bytes from Supabase storage
  const { data: fileData, error: downloadError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .download(document.storage_path);

  if (downloadError || !fileData) {
    const errMsg = `Failed to download file from storage: ${downloadError?.message}`;
    await recordFailedRun(document, dispute, errMsg);
    throw new Error(errMsg);
  }

  const arrayBuffer = await fileData.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);

  // 5. Gather allowed evidence types from seller requirements
  const requirements = dispute.evidence_requirements || [];
  const allowedEvidenceTypes = requirements.map((r: any) => r.paypal_evidence_type);
  if (allowedEvidenceTypes.length === 0) {
    allowedEvidenceTypes.push('PROOF_OF_FULFILLMENT', 'PROOF_OF_REFUND', 'OTHER');
  }

  // 6. Execute Gemini analysis
  const analysis = await analyzeDocument({
    bytes,
    mimeType: document.mime_type,
    evidenceTypes: allowedEvidenceTypes,
    reason: dispute.reason,
    orderRef: undefined,
  });

  // 7. Record run in ai_runs table
  const { data: aiRun, error: aiRunError } = await supabaseAdmin
    .from('ai_runs')
    .insert({
      organization_id: dispute.organization_id,
      dispute_id: dispute.id,
      model_provider: 'google',
      model_name: analysis.modelName,
      prompt_version: analysis.promptVersion,
      input_document_ids: [document.id],
      output: analysis.raw,
      validation_status: analysis.validationStatus,
      error_message: analysis.errorMessage || null,
    })
    .select('id')
    .single();

  const aiRunId = aiRun?.id || '';

  // 8. If validation failed, mark document as FAILED and return
  if (analysis.validationStatus === 'FAILED' || !analysis.parsed) {
    await supabaseAdmin
      .from('documents')
      .update({ processing_status: 'FAILED' })
      .eq('id', document.id);

    return {
      success: false,
      aiRunId,
      documentId: document.id,
      disputeId: dispute.id,
      analysis,
      matchCreated: false,
      error: analysis.errorMessage || 'Schema validation failed',
    };
  }

  // 9. Mark document as DONE
  await supabaseAdmin
    .from('documents')
    .update({ processing_status: 'DONE' })
    .eq('id', document.id);

  const parsed = analysis.parsed;
  let matchCreated = false;
  let createdMatchId: string | undefined;

  // 10. Check if suggested PayPal evidence type matches any requirement
  if (parsed.suggested_paypal_evidence_type) {
    const matchedReq = requirements.find(
      (r: any) => r.paypal_evidence_type === parsed.suggested_paypal_evidence_type
    );

    if (matchedReq) {
      const topSource = parsed.source_references[0];
      const excerpt = topSource?.excerpt || parsed.recommendation || '';
      const pageNumber = topSource?.page ?? 1;

      // Upsert candidate match
      const { data: matchRow, error: matchError } = await supabaseAdmin
        .from('evidence_matches')
        .insert({
          organization_id: dispute.organization_id,
          dispute_id: dispute.id,
          document_id: document.id,
          requirement_id: matchedReq.id,
          ai_run_id: aiRunId,
          match_confidence: parsed.confidence,
          supporting_excerpt: excerpt,
          page_number: pageNumber,
          ai_explanation: parsed.recommendation,
          review_status: 'AI_SUGGESTED',
        })
        .select('id')
        .single();

      if (!matchError && matchRow) {
        matchCreated = true;
        createdMatchId = matchRow.id;

        // Update requirement status to CANDIDATE_FOUND if currently MISSING
        if (matchedReq.requirement_status === 'MISSING') {
          await supabaseAdmin
            .from('evidence_requirements')
            .update({ requirement_status: 'CANDIDATE_FOUND' })
            .eq('id', matchedReq.id);
        }
      }
    }
  }

  return {
    success: true,
    aiRunId,
    documentId: document.id,
    disputeId: dispute.id,
    analysis,
    matchCreated,
    matchId: createdMatchId,
  };
}

async function recordFailedRun(document: any, dispute: any, errorMessage: string) {
  await supabaseAdmin
    .from('documents')
    .update({ processing_status: 'FAILED' })
    .eq('id', document.id);

  await supabaseAdmin.from('ai_runs').insert({
    organization_id: dispute.organization_id,
    dispute_id: dispute.id,
    model_provider: 'google',
    model_name: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    prompt_version: PROMPT_VERSION,
    input_document_ids: [document.id],
    output: null,
    validation_status: 'FAILED',
    error_message: errorMessage,
  });
}
