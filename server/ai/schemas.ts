import { z } from 'zod';

export const DOCUMENT_TYPES = [
  'order_confirmation',
  'shipping_confirmation',
  'delivery_confirmation',
  'customer_communication',
  'refund_confirmation',
  'product_description',
  'other',
] as const;

export const SourceRef = z.object({
  page: z.number().int().nullable(),
  excerpt: z.string().max(300),
});

export const DocumentAnalysis = z.object({
  document_type: z.enum(DOCUMENT_TYPES),
  suggested_paypal_evidence_type: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  extracted_fields: z.object({
    order_reference: z.string().nullable(),
    tracking_number: z.string().nullable(),
    carrier: z.string().nullable(),
    shipment_date: z.string().nullable(),
    delivery_date: z.string().nullable(),
    delivery_status: z.string().nullable(),
    amount: z.string().nullable(),
    currency: z.string().nullable(),
  }),
  supporting_fields: z.array(z.string()),
  missing_fields: z.array(z.string()),
  contradictions: z.array(z.string()),
  source_references: z.array(SourceRef),
  recommendation: z.string(),
  human_review_required: z.literal(true),
});

export type DocumentAnalysis = z.infer<typeof DocumentAnalysis>;

/**
 * JSON Schema definition compatible with Gemini Structured Output (responseSchema)
 */
export const DocumentAnalysisJsonSchema = {
  type: 'object',
  properties: {
    document_type: {
      type: 'string',
      enum: [
        'order_confirmation',
        'shipping_confirmation',
        'delivery_confirmation',
        'customer_communication',
        'refund_confirmation',
        'product_description',
        'other',
      ],
      description: 'Classification of merchant document type',
    },
    suggested_paypal_evidence_type: {
      type: 'string',
      nullable: true,
      description: 'Suggested PayPal evidence type matching allowed options provided in prompt, or null if none fit',
    },
    confidence: {
      type: 'number',
      description: 'Confidence score from 0.0 to 1.0',
    },
    extracted_fields: {
      type: 'object',
      properties: {
        order_reference: { type: 'string', nullable: true },
        tracking_number: { type: 'string', nullable: true },
        carrier: { type: 'string', nullable: true },
        shipment_date: { type: 'string', nullable: true },
        delivery_date: { type: 'string', nullable: true },
        delivery_status: { type: 'string', nullable: true },
        amount: { type: 'string', nullable: true },
        currency: { type: 'string', nullable: true },
      },
      required: [
        'order_reference',
        'tracking_number',
        'carrier',
        'shipment_date',
        'delivery_date',
        'delivery_status',
        'amount',
        'currency',
      ],
    },
    supporting_fields: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of fields supported by verbatim proof in document',
    },
    missing_fields: {
      type: 'array',
      items: { type: 'string' },
      description: 'Fields not present or unreadable in document (e.g. delivery_confirmation, signed_receipt)',
    },
    contradictions: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of conflicting statements or facts inside this document',
    },
    source_references: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          page: { type: 'integer', nullable: true },
          excerpt: { type: 'string', description: 'Verbatim excerpt under 25 words' },
        },
        required: ['page', 'excerpt'],
      },
    },
    recommendation: {
      type: 'string',
      description: 'Concise factual explanation of what this document proves and does not prove',
    },
    human_review_required: {
      type: 'boolean',
      description: 'Always set to true to mandate human verification',
    },
  },
  required: [
    'document_type',
    'suggested_paypal_evidence_type',
    'confidence',
    'extracted_fields',
    'supporting_fields',
    'missing_fields',
    'contradictions',
    'source_references',
    'recommendation',
    'human_review_required',
  ],
};
