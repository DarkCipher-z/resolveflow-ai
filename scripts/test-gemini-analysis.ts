/**
 * GEMINI ANALYSIS PIPELINE TEST
 *
 * Tests AI classification and evidence matching ONLY.
 *
 * RULE (GEMINI.md §14-16): This script MUST NOT:
 *   - Write review_status = 'HUMAN_VERIFIED' or 'REJECTED'
 *   - Insert EVIDENCE_MATCH_CONFIRMED / EVIDENCE_MATCH_REJECTED audit rows
 *   - Insert documents directly into the documents table or storage bucket
 *
 * Documents must be uploaded through POST /api/disputes/[id]/documents.
 * Human review is performed only via the browser UI.
 * Any test fixtures created here (ai_runs, evidence_matches candidates) are
 * normal pipeline outputs and are NOT deleted by this script — the merchant
 * reviews them in the UI.
 */
import 'dotenv/config';
import { supabaseAdmin } from '../server/supabase/admin';
import { runDocumentAnalysisPipeline } from '../server/ai/pipeline';
import { evidenceCoverage } from '../lib/dispute-helpers';

async function main() {
  const disputeId = 'PP-R-YYP-10198826';
  console.log(`=== TESTING GEMINI ANALYSIS PIPELINE FOR DISPUTE: ${disputeId} ===\n`);

  // 1. Fetch dispute record
  const { data: dispute, error: dError } = await supabaseAdmin
    .from('disputes')
    .select('*, evidence_requirements (*)')
    .eq('paypal_dispute_id', disputeId)
    .single();

  if (dError || !dispute) {
    throw new Error(`Dispute ${disputeId} not found: ${dError?.message}`);
  }

  console.log(`Dispute internal ID: ${dispute.id}`);
  console.log(`Requirements count: ${dispute.evidence_requirements?.length}`);
  const initialCoverage = evidenceCoverage(dispute.evidence_requirements || []);
  console.log(`Initial Coverage: ${initialCoverage.numerator}/${initialCoverage.denominator} (${initialCoverage.percent}%)\n`);

  // 2. Find documents already uploaded via the UI route (must exist before running this test)
  const { data: documents } = await supabaseAdmin
    .from('documents')
    .select('id, original_filename, processing_status')
    .eq('dispute_id', dispute.id)
    .order('created_at', { ascending: false })
    .limit(10);

  if (!documents || documents.length === 0) {
    console.log(
      'No documents found for this dispute.\n' +
      'Upload documents first through the UI at /disputes/' + dispute.id + '\n' +
      'then re-run this script to test Gemini analysis.'
    );
    return;
  }

  console.log(`Found ${documents.length} document(s) already uploaded via UI:`);
  for (const d of documents) {
    console.log(`  - ${d.id.slice(0, 8)}... ${d.original_filename} [${d.processing_status}]`);
  }

  // Pick the most recently uploaded PENDING or PROCESSING document to analyze
  const targetDoc = documents.find((d) => d.processing_status === 'PENDING' || d.processing_status === 'FAILED') || documents[0];
  console.log(`\nAnalyzing document: ${targetDoc.original_filename} (ID: ${targetDoc.id})\n`);

  // TEST 1: Run Gemini analysis pipeline
  console.log('----------------------------------------------------');
  console.log('TEST 1: Gemini multimodal extraction');
  console.log('----------------------------------------------------');
  const result = await runDocumentAnalysisPipeline(targetDoc.id, dispute.id);

  console.log('\nAnalysis Pipeline Outcome:');
  console.log(`  Success: ${result.success}`);
  console.log(`  Model Used: ${result.analysis.modelName}`);
  console.log(`  Validation Status: ${result.analysis.validationStatus}`);
  if (result.analysis.errorMessage) {
    console.log(`  Error: ${result.analysis.errorMessage}`);
  }
  if (result.analysis.parsed) {
    const p = result.analysis.parsed;
    console.log(`  Document Type: ${p.document_type}`);
    console.log(`  Suggested Evidence Type: ${p.suggested_paypal_evidence_type}`);
    console.log(`  Confidence: ${p.confidence}`);
    console.log(`  Delivery Status: ${p.extracted_fields.delivery_status ?? 'NOT FOUND'}`);
    console.log(`  Carrier: ${p.extracted_fields.carrier ?? 'NOT FOUND'}`);
    console.log(`  Tracking: ${p.extracted_fields.tracking_number ?? 'NOT FOUND'}`);
    console.log(`  Missing Fields: ${JSON.stringify(p.missing_fields)}`);
    console.log(`  Recommendation: ${p.recommendation}`);
    console.log(`  Human Review Required: ${p.human_review_required}`);
    console.log(`  Source References: ${JSON.stringify(p.source_references, null, 2)}`);
  }
  console.log(`  Candidate Match Created: ${result.matchCreated}`);
  if (result.matchId) {
    console.log(`  Match ID: ${result.matchId}`);
  }

  // Verify coverage invariant: AI_SUGGESTED must NOT increment coverage
  const { data: postDispute } = await supabaseAdmin
    .from('disputes')
    .select('*, evidence_requirements (*)')
    .eq('id', dispute.id)
    .single();

  const postCoverage = evidenceCoverage(postDispute?.evidence_requirements || []);
  console.log(`\nCoverage after AI analysis (MUST BE UNCHANGED from ${initialCoverage.numerator}/${initialCoverage.denominator}):`);
  console.log(`  Coverage: ${postCoverage.numerator}/${postCoverage.denominator} (${postCoverage.percent}%)`);

  if ((postCoverage.numerator ?? 0) !== (initialCoverage.numerator ?? 0)) {
    throw new Error('FAIL: AI candidate prematurely increased coverage! Only HUMAN_VERIFIED must count.');
  } else {
    console.log('  ✅ PASS: AI candidates correctly DO NOT increment coverage.');
  }

  console.log('\n--- STOP: Human review must be completed in the browser UI ---');
  console.log('  Open the Case Workspace and confirm or reject this AI match to verify coverage transitions.');

  console.log('\n=== GEMINI ANALYSIS TEST COMPLETED ===');
}

main().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
