import 'dotenv/config';
import { supabaseAdmin } from '../server/supabase/admin';

async function testUpload() {
  const disputeId = 'PP-R-YYP-10198826';
  console.log(`Testing document upload for dispute: ${disputeId}`);

  // Create a minimal valid PDF buffer with proper magic bytes (%PDF-1.4)
  const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 55 >>
stream
BT
/F1 12 Tf
72 712 Td
(Northstar Goods - Order ORD-1024 Proof of Fulfillment) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000202 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
308
%%EOF`;

  const blob = new Blob([pdfContent], { type: 'application/pdf' });
  const formData = new FormData();
  formData.append('files', blob, 'order_ORD1024_fulfillment.pdf');

  // Call the POST /api/disputes/[id]/documents endpoint
  const res = await fetch(`http://localhost:3000/api/disputes/${disputeId}/documents`, {
    method: 'POST',
    body: formData,
  });

  console.log('Upload response status:', res.status);
  const json = await res.json();
  console.log('Upload response body:', JSON.stringify(json, null, 2));

  if (!res.ok) {
    throw new Error(`Upload failed: ${json.error}`);
  }

  // Verify duplicate rejection
  console.log('\nTesting duplicate rejection with identical file...');
  const dupRes = await fetch(`http://localhost:3000/api/disputes/${disputeId}/documents`, {
    method: 'POST',
    body: formData,
  });
  console.log('Duplicate response status:', dupRes.status);
  const dupJson = await dupRes.json();
  console.log('Duplicate response message:', dupJson.error);

  // Inspect the written documents row from Supabase
  const { data: docRows, error: docErr } = await supabaseAdmin
    .from('documents')
    .select('id, original_filename, storage_path, mime_type, size_bytes, sha256_hash, source_type, processing_status, uploaded_at');

  console.log('\nDocuments table rows in Supabase:');
  console.log(JSON.stringify(docRows, null, 2));

  // Inspect the storage object in the private bucket
  if (docRows && docRows[0]) {
    const { data: fileData, error: storageErr } = await supabaseAdmin.storage
      .from('evidence')
      .list(docRows[0].storage_path.split('/')[0]);

    console.log('\nStorage object in "evidence" bucket:');
    console.log(JSON.stringify(fileData, null, 2));

    // Test signed URL generation
    const { data: signed } = await supabaseAdmin.storage
      .from('evidence')
      .createSignedUrl(docRows[0].storage_path, 3600);
    console.log('Signed URL generated successfully? Has token parameter:', signed?.signedUrl?.includes('token='));
  }

  // Inspect audit_logs
  const { data: auditRows } = await supabaseAdmin
    .from('audit_logs')
    .select('action_type, entity_type, entity_id, new_value, created_at')
    .eq('action_type', 'DOCUMENT_UPLOAD');

  console.log('\nAudit log for DOCUMENT_UPLOAD:');
  console.log(JSON.stringify(auditRows, null, 2));
}

testUpload().catch(console.error);
