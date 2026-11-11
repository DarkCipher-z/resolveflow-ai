/**
 * Helper calculation for evidence coverage.
 * Coverage = (required items HUMAN_VERIFIED or SUBMITTED) / (required items);
 * Returns available: false when no parseable/required items exist (spec rule 9.2).
 */
export function evidenceCoverage(reqs: { is_required: boolean; requirement_status: string }[]) {
  const required = reqs.filter((r) => r.is_required);
  if (required.length === 0) return { available: false as const };
  const done = required.filter((r) =>
    ['HUMAN_VERIFIED', 'SUBMITTED'].includes(r.requirement_status)
  ).length;
  return {
    available: true as const,
    numerator: done,
    denominator: required.length,
    percent: Math.round((done / required.length) * 100),
  };
}

/**
 * Calculates deadline priority based on hours remaining until seller response deadline.
 * Overdue (< 0h) | Urgent (<= 6h) | High (<= 24h) | Normal (> 24h) | Unknown (spec rule 9.3)
 */
export function deadlinePriority(due: Date | string | null, now = new Date()): 'OVERDUE' | 'URGENT' | 'HIGH' | 'NORMAL' | 'UNKNOWN' {
  if (!due) return 'UNKNOWN';
  const dueDate = typeof due === 'string' ? new Date(due) : due;
  if (isNaN(dueDate.getTime())) return 'UNKNOWN';
  const hrs = (dueDate.getTime() - now.getTime()) / 36e5;
  if (hrs < 0) return 'OVERDUE';
  if (hrs <= 6) return 'URGENT';
  if (hrs <= 24) return 'HIGH';
  return 'NORMAL';
}

/**
 * Human readable label for reasons
 */
export function formatDisputeReason(reason?: string | null): string {
  if (!reason) return 'Unknown Reason';
  const mapping: Record<string, string> = {
    MERCHANDISE_OR_SERVICE_NOT_RECEIVED: 'Item Not Received',
    MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: 'Significantly Not as Described',
    UNAUTHORISED: 'Unauthorized Transaction',
    CREDIT_NOT_PROCESSED: 'Credit Not Processed',
    DUPLICATE_TRANSACTION: 'Duplicate Charge',
    INCORRECT_AMOUNT: 'Incorrect Amount',
    PAYMENT_BY_OTHER_MEANS: 'Paid By Other Means',
    CANCELED_RECURRING_BILLING: 'Cancelled Subscription',
    PROBLEM_WITH_REMITTANCE: 'Remittance Problem',
  };
  return mapping[reason] ?? reason.replace(/_/g, ' ');
}

/**
 * Human readable label for lifecycle stage
 */
export function formatLifecycleStage(stage?: string | null): string {
  if (!stage) return 'Inquiry';
  const mapping: Record<string, string> = {
    INQUIRY: 'Inquiry',
    CHARGEBACK: 'Chargeback',
    PRE_ARBITRATION: 'Pre-Arbitration',
    ARBITRATION: 'Arbitration',
  };
  return mapping[stage] ?? stage;
}

/**
 * Human readable label for status
 */
export function formatDisputeStatus(status?: string | null): string {
  if (!status) return 'Unknown';
  const mapping: Record<string, string> = {
    WAITING_FOR_SELLER_RESPONSE: 'Action Required',
    WAITING_FOR_BUYER_RESPONSE: 'Waiting on Buyer',
    UNDER_REVIEW: 'Under Review',
    RESOLVED: 'Resolved',
    OPEN: 'Open',
    CLOSED: 'Closed',
  };
  return mapping[status] ?? status.replace(/_/g, ' ');
}
