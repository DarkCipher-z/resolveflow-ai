create extension if not exists "pgcrypto";

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now()
);

create table organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('OWNER','CASE_MANAGER','REVIEWER','VIEWER')),
  unique (organization_id, user_id)
);

create table paypal_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  environment text not null default 'sandbox',
  merchant_account_reference text,
  connection_status text,
  token_metadata jsonb,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table disputes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  paypal_dispute_id text not null,
  reason text,
  status text,
  lifecycle_stage text,
  amount numeric(18,2),
  currency_code varchar(3),
  seller_response_due_at timestamptz,
  allowed_response_options jsonb,
  paypal_links jsonb,
  paypal_snapshot jsonb,
  source_type text not null default 'PAYPAL' check (source_type in ('PAYPAL','DEMO_FIXTURE')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, paypal_dispute_id)
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  dispute_id uuid references disputes(id) on delete cascade,
  paypal_transaction_reference text,
  amount numeric(18,2),
  currency_code varchar(3),
  transaction_at timestamptz,
  source_type text not null check (source_type in ('PAYPAL','MERCHANT','DEMO_FIXTURE')),
  source_payload jsonb
);

create table evidence_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  dispute_id uuid not null references disputes(id) on delete cascade,
  paypal_evidence_type text not null,
  evidence_source text not null default 'PAYPAL_API',
  is_required boolean not null default true,
  requirement_status text not null default 'MISSING'
    check (requirement_status in ('MISSING','CANDIDATE_FOUND','AI_REVIEWED','HUMAN_VERIFIED','REJECTED','SUBMITTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dispute_id, paypal_evidence_type)
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  dispute_id uuid not null references disputes(id) on delete cascade,
  original_filename text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  sha256_hash text not null,
  source_type text not null check (source_type in ('MERCHANT_UPLOAD','PAYPAL_DOCUMENT','DEMO_FIXTURE')),
  processing_status text not null default 'PENDING'
    check (processing_status in ('PENDING','PROCESSING','DONE','FAILED')),
  uploaded_by uuid,
  uploaded_at timestamptz not null default now(),
  unique (organization_id, dispute_id, sha256_hash)
);

create table ai_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  dispute_id uuid not null references disputes(id) on delete cascade,
  model_provider text,
  model_name text,
  prompt_version text,
  input_document_ids uuid[],
  output jsonb,
  validation_status text,
  error_message text,
  created_at timestamptz not null default now()
);

create table evidence_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  dispute_id uuid not null references disputes(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  requirement_id uuid not null references evidence_requirements(id) on delete cascade,
  ai_run_id uuid references ai_runs(id),
  match_confidence numeric(5,4),
  supporting_excerpt text,
  page_number integer,
  ai_explanation text,
  review_status text not null default 'AI_SUGGESTED'
    check (review_status in ('AI_SUGGESTED','HUMAN_VERIFIED','REJECTED')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table evidence_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  dispute_id uuid not null references disputes(id) on delete cascade,
  approved_by uuid not null,
  approved_at timestamptz not null,
  submission_status text not null
    check (submission_status in ('PENDING','SUBMITTED','FAILED','UNKNOWN')),
  evidence_payload jsonb,
  paypal_response jsonb,
  paypal_request_id text,
  reference_key text unique,
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  paypal_event_id text not null unique,
  event_type text not null,
  resource_id text,
  verification_status text not null,
  processing_status text not null default 'PENDING',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_user_id uuid,
  actor_type text not null check (actor_type in ('USER','SYSTEM','AI')),
  action_type text not null,
  entity_type text not null,
  entity_id text not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create table case_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  dispute_id uuid not null references disputes(id) on delete cascade,
  assignee_user_id uuid not null,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  dispute_id uuid references disputes(id) on delete cascade,
  kind text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_disputes_org_status on disputes (organization_id, status);
create index if not exists idx_disputes_org_due on disputes (organization_id, seller_response_due_at);
create index if not exists idx_documents_dispute on documents (dispute_id);
create index if not exists idx_evidence_matches_dispute on evidence_matches (dispute_id);
create index if not exists idx_audit_logs_org_created on audit_logs (organization_id, created_at desc);

-- Membership helper used by RLS
create or replace function is_org_member(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members m
    where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

-- Enable RLS and add a read policy on every tenant table
do $$
declare t text;
begin
  foreach t in array array[
    'paypal_connections','disputes','transactions','evidence_requirements',
    'documents','ai_runs','evidence_matches','evidence_submissions',
    'audit_logs','case_assignments','notifications'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format(
      'create policy %I on %I for select using (is_org_member(organization_id))',
      t || '_select', t);
  end loop;
end $$;

alter table organizations enable row level security;
drop policy if exists organizations_select on organizations;
create policy organizations_select on organizations for select using (is_org_member(id));

alter table organization_members enable row level security;
drop policy if exists members_select on organization_members;
create policy members_select on organization_members for select using (user_id = auth.uid());

alter table webhook_events enable row level security; -- no policies: service role only

-- Writes happen server-side with the service role after explicit org + role checks in code.
-- Storage: bucket `evidence` is private. Access only via server-issued short-lived signed URLs.
