import React from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, Shield, User, Bot, AlertTriangle } from 'lucide-react';

export type ProvenanceType = 'PAYPAL' | 'MERCHANT' | 'AI' | 'HUMAN_VERIFIED' | 'DEMO_FIXTURE';

interface ProvenanceBadgeProps {
  origin: ProvenanceType | string;
  className?: string;
  showIcon?: boolean;
}

export function ProvenanceBadge({ origin, className, showIcon = true }: ProvenanceBadgeProps) {
  switch (origin) {
    case 'PAYPAL':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200',
            className
          )}
          title="Authoritative data directly from PayPal Disputes API"
        >
          {showIcon && <Shield className="w-2.5 h-2.5 text-blue-600" />}
          <span>PAYPAL (AUTHORITATIVE)</span>
        </span>
      );

    case 'MERCHANT':
    case 'MERCHANT_UPLOAD':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200',
            className
          )}
          title="Uploaded / entered by merchant"
        >
          {showIcon && <User className="w-2.5 h-2.5 text-slate-600" />}
          <span>MERCHANT DATA</span>
        </span>
      );

    case 'AI':
    case 'AI_SUGGESTED':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200',
            className
          )}
          title="AI-generated unverified suggestion (human review required)"
        >
          {showIcon && <Bot className="w-2.5 h-2.5 text-purple-600" />}
          <span>AI SUGGESTION (UNVERIFIED)</span>
        </span>
      );

    case 'HUMAN_VERIFIED':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200',
            className
          )}
          title="Explicitly reviewed and verified by a human case manager"
        >
          {showIcon && <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />}
          <span>HUMAN VERIFIED</span>
        </span>
      );

    case 'DEMO_FIXTURE':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200',
            className
          )}
          title="Synthetic test fixture for demonstration"
        >
          {showIcon && <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />}
          <span>DEMO FIXTURE</span>
        </span>
      );

    default:
      return (
        <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-700 border border-gray-200', className)}>
          {origin}
        </span>
      );
  }
}
