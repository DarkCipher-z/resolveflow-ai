import 'dotenv/config';
import { supabaseAdmin } from '../server/supabase/admin';

async function checkBucket() {
  console.log('Checking Supabase Storage bucket "evidence"...');
  const { data: bucket, error } = await supabaseAdmin.storage.getBucket('evidence');

  if (error) {
    console.log('Bucket "evidence" error or not found:', error.message);
    console.log('Attempting to create private bucket "evidence"...');
    const { data: created, error: createError } = await supabaseAdmin.storage.createBucket('evidence', {
      public: false,
      fileSizeLimit: 10485760, // 10MB
      allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/gif'],
    });
    if (createError) {
      console.error('Failed to create bucket:', createError.message);
    } else {
      console.log('Successfully created private bucket "evidence"!');
    }
  } else {
    console.log('Bucket "evidence" exists!');
    console.log('  Public:', bucket.public);
    console.log('  File size limit:', bucket.file_size_limit);
  }
}

checkBucket().catch(console.error);
