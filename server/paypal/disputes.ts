import { paypalFetch } from './client';

export interface PayPalMoney {
  currency_code: string;
  value: string;
}

export interface PayPalLink {
  href: string;
  rel: string;
  method: string;
}

export interface PayPalEvidenceItem {
  evidence_type: string;
  source?: string;
  date?: string;
  notes?: string;
  dispute_life_cycle_stage?: string;
  evidence_info?: Record<string, any>;
  documents?: Array<{ name: string; url?: string }>;
}

export interface PayPalDisputeSummary {
  dispute_id: string;
  create_time?: string;
  update_time?: string;
  reason?: string;
  status?: string;
  dispute_state?: string;
  dispute_life_cycle_stage?: string;
  dispute_channel?: string;
  dispute_amount?: PayPalMoney;
  seller_response_due_date?: string;
  links?: PayPalLink[];
}

export interface PayPalDisputeDetail extends PayPalDisputeSummary {
  disputed_transactions?: Array<{
    buyer_transaction_id?: string;
    seller_transaction_id?: string;
    reference_id?: string;
    create_time?: string;
    transaction_status?: string;
    gross_amount?: PayPalMoney;
    items?: any[];
  }>;
  allowed_response_options?: Record<string, any>;
  evidences?: PayPalEvidenceItem[];
  messages?: any[];
  offer?: any;
}

export interface ListDisputesResponse {
  items?: PayPalDisputeSummary[];
  total_items?: number;
  total_pages?: number;
  links?: PayPalLink[];
}

/**
 * Lists disputes from PayPal Sandbox.
 */
export async function fetchDisputesList(params?: {
  pageSize?: number;
  disputeState?: string;
  startTime?: string;
}): Promise<ListDisputesResponse> {
  const query = new URLSearchParams();
  query.set('page_size', String(params?.pageSize ?? 20));
  if (params?.disputeState) query.set('dispute_state', params.disputeState);
  if (params?.startTime) query.set('start_time', params.startTime);

  return paypalFetch<ListDisputesResponse>(`/v1/customer/disputes?${query.toString()}`);
}

/**
 * Fetches the full dispute detail from PayPal Sandbox.
 */
export async function fetchDisputeDetail(disputeId: string): Promise<PayPalDisputeDetail> {
  return paypalFetch<PayPalDisputeDetail>(`/v1/customer/disputes/${encodeURIComponent(disputeId)}`);
}

export interface DerivedAction {
  id: string;
  label: string;
  method: string;
  source: 'LINK' | 'ALLOWED_OPTION' | 'BOTH';
  enabled: boolean;
}

/**
 * Derives allowable merchant actions from BOTH allowed_response_options and HATEOAS links.
 * Never relies solely on hardcoded status guessing (spec rule 5).
 */
export function deriveAllowedActions(dispute: PayPalDisputeDetail): DerivedAction[] {
  const actions: DerivedAction[] = [];
  const links = dispute.links ?? [];
  const allowed = dispute.allowed_response_options ?? {};

  const hasLink = (relName: string) => links.some((l) => l.rel === relName);
  const getLinkMethod = (relName: string, def = 'POST') =>
    links.find((l) => l.rel === relName)?.method ?? def;

  // 1. Provide Evidence
  const hasProvideEvidenceLink = hasLink('provide_evidence') || hasLink('provide-evidence');
  const hasProvideEvidenceOption = Boolean(allowed.provide_evidence || allowed.provide_evidence_info);
  if (hasProvideEvidenceLink || hasProvideEvidenceOption) {
    actions.push({
      id: 'PROVIDE_EVIDENCE',
      label: 'Submit Evidence',
      method: getLinkMethod('provide_evidence'),
      source: hasProvideEvidenceLink && hasProvideEvidenceOption ? 'BOTH' : hasProvideEvidenceLink ? 'LINK' : 'ALLOWED_OPTION',
      enabled: true,
    });
  }

  // 2. Accept Claim
  const hasAcceptClaimLink = hasLink('accept_claim') || hasLink('accept-claim');
  const hasAcceptClaimOption = Boolean(allowed.accept_claim);
  if (hasAcceptClaimLink || hasAcceptClaimOption) {
    actions.push({
      id: 'ACCEPT_CLAIM',
      label: 'Accept Claim & Refund',
      method: getLinkMethod('accept_claim'),
      source: hasAcceptClaimLink && hasAcceptClaimOption ? 'BOTH' : hasAcceptClaimLink ? 'LINK' : 'ALLOWED_OPTION',
      enabled: true,
    });
  }

  // 3. Make Offer
  const hasMakeOfferLink = hasLink('make_offer') || hasLink('make-offer');
  const hasMakeOfferOption = Boolean(allowed.make_offer);
  if (hasMakeOfferLink || hasMakeOfferOption) {
    actions.push({
      id: 'MAKE_OFFER',
      label: 'Make Offer',
      method: getLinkMethod('make_offer'),
      source: hasMakeOfferLink && hasMakeOfferOption ? 'BOTH' : hasMakeOfferLink ? 'LINK' : 'ALLOWED_OPTION',
      enabled: true,
    });
  }

  // 4. Send Message
  const hasMessageLink = hasLink('send_message') || hasLink('send-message');
  if (hasMessageLink) {
    actions.push({
      id: 'SEND_MESSAGE',
      label: 'Send Message to Buyer',
      method: getLinkMethod('send_message'),
      source: 'LINK',
      enabled: true,
    });
  }

  // 5. Escalate
  const hasEscalateLink = hasLink('escalate');
  if (hasEscalateLink) {
    actions.push({
      id: 'ESCALATE',
      label: 'Escalate to Claim',
      method: getLinkMethod('escalate'),
      source: 'LINK',
      enabled: true,
    });
  }

  // 6. Appeal
  const hasAppealLink = hasLink('appeal');
  if (hasAppealLink) {
    actions.push({
      id: 'APPEAL',
      label: 'Appeal Decision',
      method: getLinkMethod('appeal'),
      source: 'LINK',
      enabled: true,
    });
  }

  return actions;
}
