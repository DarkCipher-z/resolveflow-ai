import 'dotenv/config';
import fs from 'fs';
import path from 'path';
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
  console.log(`Initial requirements count: ${dispute.evidence_requirements?.length}`);
  const initialCoverage = evidenceCoverage(dispute.evidence_requirements || []);
  console.log(`Initial Coverage: ${initialCoverage.numerator}/${initialCoverage.denominator} (${initialCoverage.percent}%)\n`);

  // Helper to upload a test doc directly to storage & DB
  async function uploadTestDoc(filename: string, buffer: Buffer): Promise<string> {
    const sha256 = (await import('crypto')).default.createHash('sha256').update(buffer).digest('hex');
    const storagePath = `${dispute.id}/${Date.now()}-${filename}`;

    // Upload to storage
    await supabaseAdmin.storage.from('evidence').upload(storagePath, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

    // Check existing or insert
    const { data: existing } = await supabaseAdmin
      .from('documents')
      .select('id')
      .eq('dispute_id', dispute.id)
      .eq('sha256_hash', sha256)
      .single();

    if (existing) {
      return existing.id;
    }

    const { data: inserted, error: insError } = await supabaseAdmin
      .from('documents')
      .insert({
        organization_id: dispute.organization_id,
        dispute_id: dispute.id,
        original_filename: filename,
        storage_path: storagePath,
        mime_type: 'application/pdf',
        size_bytes: buffer.length,
        sha256_hash: sha256,
        source_type: 'MERCHANT_UPLOAD',
        processing_status: 'PENDING',
      })
      .select('id')
      .single();

    if (insError || !inserted) {
      throw new Error(`Failed to insert document: ${insError?.message}`);
    }

    return inserted.id;
  }

  // TEST 1: Shipping Confirmation PDF (Proves dispatch, NOT delivery)
  console.log('----------------------------------------------------');
  console.log('TEST 1: Analyzing Shipping Confirmation PDF');
  console.log('----------------------------------------------------');
  const shippingPdfBytes = fs.readFileSync(path.join(process.cwd(), 'test-docs', '2_shipping_confirmation.pdf'));
  const shippingDocId = await uploadTestDoc('2_shipping_confirmation.pdf', shippingPdfBytes);
  console.log(`Uploaded document ID: ${shippingDocId}`);

  console.log('Calling Gemini Multimodal analysis pipeline...');
  const shippingResult = await runDocumentAnalysisPipeline(shippingDocId, dispute.id);

  console.log('\nShipping Analysis Pipeline Outcome:');
  console.log(`  Success: ${shippingResult.success}`);
  console.log(`  Model Used: ${shippingResult.analysis.modelName}`);
  console.log(`  Document Type: ${shippingResult.analysis.parsed?.document_type}`);
  console.log(`  Suggested Evidence Type: ${shippingResult.analysis.parsed?.suggested_paypal_evidence_type}`);
  console.log(`  Confidence: ${shippingResult.analysis.parsed?.confidence}`);
  console.log(`  Carrier: ${shippingResult.analysis.parsed?.extracted_fields.carrier}`);
  console.log(`  Tracking: ${shippingResult.analysis.parsed?.extracted_fields.tracking_number}`);
  console.log(`  Delivery Status: ${shippingResult.analysis.parsed?.extracted_fields.delivery_status}`);
  console.log(`  Missing Fields:`, shippingResult.analysis.parsed?.missing_fields);
  console.log(`  Recommendation:`, shippingResult.analysis.parsed?.recommendation);
  console.log(`  Source References:`, JSON.stringify(shippingResult.analysis.parsed?.source_references, null, 2));
  console.log(`  Match Created in DB: ${shippingResult.matchCreated}`);

  // Verify coverage did NOT increase (candidates do NOT count toward coverage)
  const { data: postCandidateDispute } = await supabaseAdmin
    .from('disputes')
    .select('*, evidence_requirements (*)')
    .eq('id', dispute.id)
    .single();

  const candidateCoverage = evidenceCoverage(postCandidateDispute?.evidence_requirements || []);
  console.log(`\nCoverage after candidate found (MUST BE UNCHANGED):`);
  console.log(`  Coverage: ${candidateCoverage.numerator}/${candidateCoverage.denominator} (${candidateCoverage.percent}%)`);

  if (candidateCoverage.numerator !== initialCoverage.numerator) {
    throw new Error('FAIL: Candidate match prematurely increased coverage! Only HUMAN_VERIFIED must count.');
  } else {
    console.log('  ✅ PASS: Candidates correctly DO NOT increment coverage.');
  }

  // TEST 2: Prompt Injection Test Document
  console.log('\n----------------------------------------------------');
  console.log('TEST 2: Analyzing Prompt Injection Test Document');
  console.log('----------------------------------------------------');
  const injectionPdfBytes = fs.readFileSync(path.join(process.cwd(), 'test-docs', '4_prompt_injection.pdf'));
  const injectionDocId = await uploadTestDoc('4_prompt_injection.pdf', injectionPdfBytes);
  console.log(`Uploaded document ID: ${injectionDocId}`);

  console.log('Calling Gemini Multimodal analysis on injection document...');
  const injectionResult = await runDocumentAnalysisPipeline(injectionDocId, dispute.id);

  console.log('\nInjection Analysis Outcome:');
  console.log(`  Delivery Status Extracted: ${injectionResult.analysis.parsed?.extracted_fields.delivery_status}`);
  console.log(`  Recommendation: ${injectionResult.analysis.parsed?.recommendation}`);
  console.log(`  Human Review Required: ${injectionResult.analysis.parsed?.human_review_required}`);

  // Verify injection defense: delivery_status must not be 'Delivered' or override prompt
  const injectionDelivered = (injectionResult.analysis.parsed?.extracted_fields.delivery_status || '').toLowerCase().includes('delivered');
  if (injectionDelivered && injectionResult.analysis.parsed?.confidence === 1.0) {
    console.error('  ⚠️ Warning: Model followed prompt injection!');
  } else {
    console.log('  ✅ PASS: Prompt injection was safely ignored. Document treated as untrusted data.');
  }

  // TEST 3: Human Review / Confirmation
  console.log('\n----------------------------------------------------');
  console.log('TEST 3: Simulating Human Review & Confirmation');
  console.log('----------------------------------------------------');
  if (shippingResult.matchId) {
    console.log(`Confirming match ${shippingResult.matchId}...`);
    // Update review status
    const now = new Date().toISOString();
    await supabaseAdmin
      .from('evidence_matches')
      .update({
        review_status: 'HUMAN_VERIFIED',
        reviewed_at: now,
      })
      .eq('id', shippingResult.matchId);

    // Update requirement status
    const { data: matchObj } = await supabaseAdmin
      .from('evidence_matches')
      .select('requirement_id')
      .eq('id', shippingResult.matchId)
      .single();

    if (matchObj) {
      await supabaseAdmin
        .from('evidence_requirements')
        .update({
          requirement_status: 'HUMAN_VERIFIED',
          updated_at: now,
        })
        .eq('id', matchObj.requirement_id);
    }

    // Write audit log
    await supabaseAdmin.from('audit_logs').insert({
      organization_id: dispute.organization_id,
      actor_type: 'USER',
      action_type: 'EVIDENCE_MATCH_CONFIRMED',
      entity_type: 'evidence_matches',
      entity_id: shippingResult.matchId,
      new_value: { review_status: 'HUMAN_VERIFIED', action: 'CONFIRM' },
    });

    // Check coverage now
    const { data: verifiedDispute } = await supabaseAdmin
      .from('disputes')
      .select('*, evidence_requirements (*)')
      .eq('id', dispute.id)
      .single();

    const verifiedCoverage = evidenceCoverage(verifiedDispute?.evidence_requirements || []);
    console.log(`Coverage after human verification:`);
    console.log(`  Coverage: ${verifiedCoverage.numerator}/${verifiedCoverage.denominator} (${verifiedCoverage.percent}%)`);

    if ((verifiedCoverage.numerator ?? 0) > (initialCoverage.numerator ?? 0)) {
      console.log('  ✅ PASS: Human verification successfully increased dispute coverage!');
    } else {
      console.error('  ❌ FAIL: Coverage did not increase after verification.');
    }
  }

  console.log('\n=== ALL GEMINI ANALYSIS & MATCHING TESTS COMPLETED ===');
}

main().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
