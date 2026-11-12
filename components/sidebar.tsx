'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShieldAlert,
  LayoutDashboard,
  Inbox,
  Sparkles,
  FileText,
  Share2,
  BarChart3,
  History,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  {
    category: 'WORKSPACE',
    items: [
      { label: 'Overview', href: '/', icon: LayoutDashboard },
      { label: 'All Disputes', href: '/disputes', icon: Inbox },
    ],
  },
  {
    category: 'INTELLIGENCE',
    items: [
      { label: 'Evidence Library', href: '/evidence-library', icon: FileText, badge: 'Phase 2' },
      { label: 'AI Investigator', href: '/ai-investigator', icon: Sparkles, badge: 'Phase 2' },
      { label: 'Evidence Graph', href: '/evidence-graph', icon: Share2, badge: 'Phase 4' },
      { label: 'Analytics', href: '/analytics', icon: BarChart3, badge: 'Phase 4' },
    ],
  },
  {
    category: 'MANAGEMENT',
    items: [
      { label: 'Activity Log', href: '/activity', icon: History, badge: 'Phase 4' },
      { label: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col h-screen sticky top-0 text-sidebar-foreground">
      {/* Brand header */}
      <div className="p-5 border-b border-sidebar-border flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-white shadow-md">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-bold text-base tracking-tight text-white flex items-center gap-1.5">
            ResolveFlow <span className="text-blue-400 text-xs font-semibold px-1.5 py-0.5 rounded bg-blue-900/50">AI</span>
          </h1>
          <p className="text-[11px] text-sidebar-muted">Dispute Case Workspace</p>
        </div>
      </div>

      {/* Merchant Context */}
      <div className="px-4 py-3 border-b border-sidebar-border bg-[#0d162a] space-y-1.5">
        <div>
          <p className="text-[10px] uppercase font-semibold text-sidebar-muted tracking-wider">
            Merchant Organization
          </p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-white truncate">Northstar Goods</p>
          <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 whitespace-nowrap">
            Single-merchant mode
          </span>
        </div>
      </div>

      {/* Navigation items */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {navItems.map((group) => (
          <div key={group.category} className="space-y-1">
            <h2 className="px-3 text-[10px] font-bold uppercase tracking-wider text-sidebar-muted">
              {group.category}
            </h2>
            <div className="space-y-0.5 pt-1">
              {group.items.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors',
                      isActive
                        ? 'bg-sidebar-accent text-white font-semibold'
                        : 'text-sidebar-muted hover:text-white hover:bg-sidebar-accent/50'
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={cn('w-4 h-4', isActive ? 'text-primary' : 'text-sidebar-muted')} />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer Info */}
      <div className="p-4 border-t border-sidebar-border bg-[#0d162a]/60 text-[11px] text-sidebar-muted">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>PayPal Sandbox</span>
        </div>
      </div>
    </aside>
  );
}
