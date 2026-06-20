'use client';

import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Building2,
  Layers,
  GitBranch,
  BarChart3,
  Target,
  TrendingUp,
  DollarSign,
  Menu,
  X,
  Users,
  BookOpen,
  Upload,
  Clock,
  ArrowLeftRight,
  FileText,
  Settings,
  Coins,
  Search,
  Sparkles,
  Shield,
  PenLine,
  Workflow,
  ChevronsLeft,
  ChevronsRight,
  Rocket,
} from 'lucide-react';
import { useAppStore, ViewType } from '@/lib/store';
import { availablePeriods } from '@/lib/demo-data';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn, formatEUR } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';
import { getEntities, runConsolidation } from '@/lib/api';
import { Entity } from '@/lib/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Nav groups for divider lines
const navGroups: { items: { view: ViewType; label: string; icon: React.ElementType; description: string; shortcut?: string }[] }[] = [
  {
    items: [
      { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Group KPIs and financial overview', shortcut: '\u2318 1' },
      { view: 'entities', label: 'Entities', icon: Building2, description: 'Manage subsidiaries and parameters', shortcut: '\u2318 2' },
      { view: 'consolidation', label: 'Consolidation', icon: Layers, description: 'Consolidated financial statements', shortcut: '\u2318 3' },
      { view: 'ic-transactions', label: 'IC Transactions', icon: ArrowLeftRight, description: 'Intercompany transaction matching' },
      { view: 'journal', label: 'Journal Entry', icon: PenLine, description: 'Manual journal entry editor' },
    ],
  },
  {
    items: [
      { view: 'scenarios', label: 'Scenarios', icon: GitBranch, description: 'Scenario analysis and modelling', shortcut: '\u2318 4' },
      { view: 'variance', label: 'Variance', icon: BarChart3, description: 'Budget vs actual variance' },
      { view: 'budget', label: 'Budget vs Actual', icon: Target, description: 'Budget tracking and analysis' },
      { view: 'trends', label: 'Trend Analysis', icon: TrendingUp, description: 'Multi-period trend analysis' },
      { view: 'forecast', label: 'Cash Flow Forecast', icon: Coins, description: 'Cash flow projections' },
      { view: 'projects', label: 'Projects', icon: Rocket, description: 'Investment appraisal (NPV/IRR)' },
    ],
  },
  {
    items: [
      { view: 'fx-rates', label: 'FX Rates', icon: DollarSign, description: 'Exchange rate management', shortcut: '\u2318 5' },
      { view: 'coa', label: 'Chart of Accounts', icon: BookOpen, description: 'Group COA and mappings' },
      { view: 'reports', label: 'Reports', icon: FileText, description: 'Generate financial reports' },
      { view: 'ai-insights', label: 'AI Insights', icon: Sparkles, description: 'AI-powered financial analysis', shortcut: '\u2318 6' },
      { view: 'compliance', label: 'Compliance', icon: Shield, description: 'Regulatory checks and compliance', shortcut: '\u2318 7' },
    ],
  },
  {
    items: [
      { view: 'import', label: 'Data Import', icon: Upload, description: 'CSV import wizard' },
      { view: 'audit', label: 'Audit Trail', icon: Clock, description: 'Activity log and audit' },
      { view: 'workflow', label: 'Workflow', icon: Workflow, description: 'Consolidation workflow tracker' },
    ],
  },
  {
    items: [
      { view: 'settings', label: 'Settings', icon: Settings, description: 'System configuration' },
    ],
  },
];

// Flatten for search
const navItems = navGroups.flatMap(g => g.items);

// Entity online status data
const entityOnlineStatus = [
  { code: 'PT0001', name: 'Portugal', online: true },
  { code: 'ES0002', name: 'España', online: true },
  { code: 'DE0003', name: 'Deutschland', online: true },
  { code: 'UK0004', name: 'UK', online: true },
  { code: 'FR0005', name: 'France', online: true },
];

export function AppSidebar() {
  const { activeView, setActiveView, selectedPeriod, setSelectedPeriod, selectedScenario, setSelectedScenario, sidebarOpen, setSidebarOpen, sidebarCollapsed, setSidebarCollapsed } = useAppStore();
  const [entityCount, setEntityCount] = useState(5);
  const [groupRevenue, setGroupRevenue] = useState('€51.9M');
  const [lastRun, setLastRun] = useState('Dec');
  const [searchQuery, setSearchQuery] = useState('');
  const [recentlyViewed, setRecentlyViewed] = useState<ViewType[]>(['dashboard', 'entities', 'consolidation']);

  // Fetch dynamic group summary
  useEffect(() => {
    async function loadSummary() {
      try {
        const entities = await getEntities();
        setEntityCount(entities.length);
        const entityCodes = entities.map((e: Entity) => e.code);
        if (entityCodes.length > 0) {
          try {
            const result = await runConsolidation({
              period: selectedPeriod,
              entityCodes,
              scenarioType: selectedScenario,
            });
            if (result?.kpis) {
              setGroupRevenue(formatEUR(result.kpis.totalRevenue));
            }
          } catch {}
        }
        const periodDate = new Date(selectedPeriod + '-01');
        setLastRun(periodDate.toLocaleDateString('en-US', { month: 'short' }));
      } catch {}
    }
    loadSummary();
  }, [selectedPeriod, selectedScenario]);

  const sidebarWidth = sidebarCollapsed ? 'w-16' : 'w-64';

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 text-white flex flex-col transition-all duration-300 lg:relative lg:translate-x-0 shadow-xl sidebar-transition',
          sidebarWidth,
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className={cn('flex items-center gap-3 border-b border-slate-700/50 relative overflow-hidden', sidebarCollapsed ? 'px-3 py-4 justify-center' : 'px-5 py-5')}>
          {/* Subtle animated background */}
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-900/20 via-teal-900/20 to-emerald-900/10 animate-gradient" />
          <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/25 shrink-0">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          {!sidebarCollapsed && (
            <div className="relative sidebar-collapsed-label">
              <h1 className="text-lg font-bold tracking-tight">ConsolidaçãoFX</h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">Financial Group</p>
            </div>
          )}
          <button
            className="ml-auto lg:hidden text-slate-400 hover:text-white transition-colors duration-150"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Group Summary Mini-Stats */}
        {!sidebarCollapsed && (
          <div className="px-4 py-3 border-b border-slate-700/50">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2.5 flex items-center gap-1.5">
              <Users className="w-3 h-3" /> Group Summary
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-800/60 rounded-lg px-2 py-1.5 text-center border border-slate-700/30">
                <p className="text-xs font-bold text-emerald-400">{entityCount}</p>
                <p className="text-[9px] text-slate-500 leading-tight">Entities</p>
              </div>
              <div className="bg-slate-800/60 rounded-lg px-2 py-1.5 text-center border border-slate-700/30">
                <p className="text-xs font-bold text-emerald-400">{groupRevenue}</p>
                <p className="text-[9px] text-slate-500 leading-tight">Revenue</p>
              </div>
              <div className="bg-slate-800/60 rounded-lg px-2 py-1.5 text-center border border-slate-700/30">
                <p className="text-xs font-bold text-emerald-400 flex items-center justify-center gap-0.5">
                  <Clock className="w-2.5 h-2.5" />{lastRun}
                </p>
                <p className="text-[9px] text-slate-500 leading-tight">Last Run</p>
              </div>
            </div>
            {/* Entity online indicators */}
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              {entityOnlineStatus.map((entity) => (
                <TooltipProvider key={entity.code} delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800/40 border border-slate-700/20">
                        <span className="w-1.5 h-1.5 rounded-full status-pulse-green" />
                        <span className="text-[9px] text-slate-400">{entity.code}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="bg-slate-900 text-white text-xs border-slate-700">
                      <p>{entity.name} — <span className="text-emerald-400">Online</span></p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          </div>
        )}

        {/* Collapsed entity indicator */}
        {sidebarCollapsed && (
          <div className="flex justify-center py-2 border-b border-slate-700/50">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full status-pulse-green" />
                    <span className="text-[9px] text-emerald-400 font-bold">{entityCount}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-slate-900 text-white text-xs border-slate-700">
                  <p>{entityCount} entities online</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}

        {/* Navigation */}
        <nav className={cn('flex-1 py-3 space-y-0.5 overflow-y-auto custom-scrollbar-dark', sidebarCollapsed ? 'px-2' : 'px-3')}>
          {/* Quick Search */}
          {!sidebarCollapsed && (
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Quick search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-colors duration-150"
              />
            </div>
          )}

          <TooltipProvider delayDuration={300}>
            {navGroups.map((group, groupIdx) => {
              const filteredItems = group.items.filter((item) => !searchQuery || item.label.toLowerCase().includes(searchQuery.toLowerCase()));
              if (filteredItems.length === 0) return null;

              return (
                <div key={groupIdx}>
                  {/* Divider between groups */}
                  {groupIdx > 0 && (
                    <div className="my-2 mx-2 border-t border-slate-700/40" />
                  )}
                  {filteredItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeView === item.view;
                    return (
                      <Tooltip key={item.view}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => {
                              setActiveView(item.view);
                              setRecentlyViewed(prev => [item.view, ...prev.filter(v => v !== item.view)].slice(0, 3));
                              if (window.innerWidth < 1024) setSidebarOpen(false);
                            }}
                            className={cn(
                              'w-full flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-200 group relative',
                              sidebarCollapsed ? 'px-0 py-2.5 justify-center' : 'px-3 py-2.5',
                              isActive
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                                : 'text-slate-400 hover:bg-white/5 hover:backdrop-blur-sm hover:text-white border border-transparent hover:translate-x-1'
                            )}
                          >
                            {/* Glowing left border for active state */}
                            {isActive && (
                              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-emerald-400 rounded-r-full shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-glow-pulse" />
                            )}
                            <Icon className={cn(
                              'w-4 h-4 transition-all duration-200 shrink-0',
                              isActive ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'
                            )} />
                            {!sidebarCollapsed && (
                              <span className="sidebar-collapsed-label">{item.label}</span>
                            )}
                            {/* AI Insights pulsing dot + New badge */}
                            {!sidebarCollapsed && item.view === 'ai-insights' && (
                              <span className="ml-auto flex items-center gap-1.5">
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                                </span>
                                <span className="text-[8px] px-1.5 py-0.5 rounded bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 animate-gradient font-semibold">
                                  New
                                </span>
                              </span>
                            )}
                            {/* Compliance New badge */}
                            {!sidebarCollapsed && item.view === 'compliance' && (
                              <span className="ml-auto">
                                <span className="text-[8px] px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 font-semibold">
                                  New
                                </span>
                              </span>
                            )}
                            {/* Keyboard shortcut hint on hover */}
                            {!sidebarCollapsed && item.shortcut && !isActive && item.view !== 'ai-insights' && (
                              <span className="ml-auto text-[9px] text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono">
                                {item.shortcut}
                              </span>
                            )}
                          </button>
                        </TooltipTrigger>
                        {sidebarCollapsed && (
                          <TooltipContent side="right" className="bg-slate-900 text-white text-xs border-slate-700">
                            <p className="font-medium">{item.label}</p>
                            <p className="text-slate-400 text-[10px]">{item.description}</p>
                          </TooltipContent>
                        )}
                        {!sidebarCollapsed && (
                          <TooltipContent side="right" className="bg-slate-900 text-white text-xs border-slate-700">
                            <p className="font-medium">{item.label}</p>
                            <p className="text-slate-400 text-[10px]">{item.description}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    );
                  })}
                </div>
              );
            })}
          </TooltipProvider>
        </nav>

        <Separator className="bg-slate-700/50" />

        {/* Selectors - only show when expanded */}
        {!sidebarCollapsed && (
          <div className="px-4 py-3 space-y-2.5">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 block">Period</label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-full bg-slate-800/60 border-slate-700 text-white text-xs h-8 hover:bg-slate-700/80 transition-colors duration-150">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availablePeriods.slice(0, 12).map((p) => (
                    <SelectItem key={p} value={p}>
                      {new Date(p + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 block">Scenario</label>
              <Select value={selectedScenario} onValueChange={setSelectedScenario}>
                <SelectTrigger className="w-full bg-slate-800/60 border-slate-700 text-white text-xs h-8 hover:bg-slate-700/80 transition-colors duration-150">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="base">Base Case</SelectItem>
                  <SelectItem value="optimistic">Optimistic</SelectItem>
                  <SelectItem value="pessimistic">Pessimistic</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Bottom section: Theme Toggle + Version */}
        <div className={cn('border-t border-slate-700/50 space-y-2', sidebarCollapsed ? 'px-2 py-3 flex flex-col items-center' : 'px-4 py-3')}>
          {/* Recently Viewed - only show when expanded */}
          {!sidebarCollapsed && (
            <div>
              <p className="text-[9px] uppercase tracking-widest text-slate-600 mb-1.5">Recently Viewed</p>
              <div className="flex items-center gap-1.5">
                {recentlyViewed.map((view) => {
                  const navItem = navItems.find(n => n.view === view);
                  if (!navItem) return null;
                  const Icon = navItem.icon;
                  return (
                    <button
                      key={view}
                      onClick={() => setActiveView(view)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800/40 text-[10px] text-slate-400 hover:text-emerald-400 hover:bg-slate-700/60 transition-colors duration-150"
                      title={navItem.label}
                    >
                      <Icon className="w-3 h-3" />
                      <span className="hidden xl:inline">{navItem.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className={cn('flex items-center', sidebarCollapsed ? 'flex-col gap-2' : 'justify-between')}>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
              {!sidebarCollapsed && <p className="text-[10px] text-slate-500">v3.2.0 · 19 Views</p>}
            </div>
            <div className="flex items-center gap-1.5">
              <ThemeToggle />
              {/* Collapse toggle */}
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-slate-500 hover:text-emerald-400 hover:bg-slate-800/60 transition-colors duration-150 hidden lg:flex"
                      onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    >
                      {sidebarCollapsed ? <ChevronsRight className="w-3.5 h-3.5" /> : <ChevronsLeft className="w-3.5 h-3.5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-slate-900 text-white text-xs border-slate-700">
                    {sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

// Mobile menu button (used in header)
export function MobileMenuButton() {
  const { sidebarOpen, setSidebarOpen } = useAppStore();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="lg:hidden"
      onClick={() => setSidebarOpen(!sidebarOpen)}
    >
      <Menu className="w-5 h-5" />
    </Button>
  );
}
