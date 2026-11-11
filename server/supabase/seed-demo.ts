import { supabaseAdmin } from './admin';

export const DEMO_ORG_ID = '00000000-0000-0000-0000-000000000001';
export const DEMO_ORG_NAME = 'Northstar Goods';
export const DEMO_USER_ID = '00000000-0000-0000-0000-000000000002';

/**
 * Ensures the single-merchant demo organization exists in the database.
 * Returns the default organization ID.
 */
export async function getOrCreateDemoOrganization(): Promise<string> {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('organizations')
    .select('id, name')
    .eq('id', DEMO_ORG_ID)
    .single();

  if (existing) {
    return existing.id;
  }

  // Create demo organization
  const { data: created, error: insertError } = await supabaseAdmin
    .from('organizations')
    .upsert({
      id: DEMO_ORG_ID,
      name: DEMO_ORG_NAME,
      timezone: process.env.DEFAULT_TIMEZONE ?? 'Asia/Kolkata',
    })
    .select()
    .single();

  if (insertError) {
    console.error('Error seeding demo organization:', insertError);
    throw new Error(`Failed to ensure demo organization: ${insertError.message}`);
  }

  // Also ensure organization_members record exists
  await supabaseAdmin
    .from('organization_members')
    .upsert({
      organization_id: DEMO_ORG_ID,
      user_id: DEMO_USER_ID,
      role: 'OWNER',
    }, { onConflict: 'organization_id,user_id' });

  return created.id;
}
