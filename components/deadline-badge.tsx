import React from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, Clock, AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import { deadlinePriority } from '@/lib/dispute-helpers';

interface DeadlineBadgeProps {
  dueDate: string | Date | null | undefined;
  className?: string;
  showIcon?: boolean;
}

export function DeadlineBadge({ dueDate, className, showIcon = true }: DeadlineBadgeProps) {
  const priority = deadlinePriority(dueDate ?? null);

  switch (priority) {
    case 'OVERDUE':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 border border-red-300',
            className
          )}
          title="Past the PayPal seller response deadline"
        >
          {showIcon && <AlertCircle className="w-2.5 h-2.5 text-red-600" />}
          <span>OVERDUE</span>
        </span>
      );

    case 'URGENT':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300',
            className
          )}
          title="Deadline is within 6 hours"
        >
          {showIcon && <AlertTriangle className="w-2.5 h-2.5 text-amber-700" />}
          <span>URGENT (≤6h)</span>
        </span>
      );

    case 'HIGH':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-900 border border-yellow-300',
            className
          )}
          title="Deadline is within 24 hours"
        >
          {showIcon && <Clock className="w-2.5 h-2.5 text-yellow-700" />}
          <span>HIGH (≤24h)</span>
        </span>
      );

    case 'NORMAL':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200',
            className
          )}
          title="More than 24 hours remaining"
        >
          {showIcon && <CheckCircle2 className="w-2.5 h-2.5 text-slate-500" />}
          <span>NORMAL</span>
        </span>
      );

    case 'UNKNOWN':
    default:
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 border border-gray-200',
            className
          )}
          title="No deadline specified by PayPal"
        >
          {showIcon && <HelpCircle className="w-2.5 h-2.5 text-gray-500" />}
          <span>UNKNOWN</span>
        </span>
      );
  }
}
