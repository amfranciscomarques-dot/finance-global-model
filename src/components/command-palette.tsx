'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Command } from 'cmdk';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Building2,
  Layers,
  ArrowLeftRight,
  GitBranch,
  BarChart3,
  Target,
  TrendingUp,
  Coins,
  DollarSign,
  BookOpen,
  FileText,
  Sparkles,
  Upload,
  Clock,
  Settings,
  Play,
  FileSpreadsheet,
  Sun,
  Moon,
  Database,
  Search,
  X,
  CornerDownLeft,
} from 'lucide-react';
import { useAppStore, ViewType } from '@/lib/store';
import { useTheme } from 'next-themes';
import { runConsolidation, seedDatabase, getEntities } from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ============================================================
// Types
// ============================================================
interface PaletteItem {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  group: 'navigation' | 'actions' | 'entities';
  shortcut?: string;
  action: () => void;
}

// ============================================================
// Navigation Items Definition
// ============================================================
const navigationItems: Omit<PaletteItem, 'action'>[] = [
  { id: 'nav-dashboard', label: 'Dashboard', description: 'Group KPIs and financial overview', icon: LayoutDashboard, group: 'navigation', shortcut: '\u23181' },
  { id: 'nav-entities', label: 'Entities', description: 'Manage subsidiaries and parameters', icon: Building2, group: 'navigation', shortcut: '\u23182' },
  { id: 'nav-consolidation', label: 'Consolidation', description: 'Consolidated financial statements', icon: Layers, group: 'navigation', shortcut: '\u23183' },
  { id: 'nav-ic-transactions', label: 'IC Transactions', description: 'Intercompany transaction matching', icon: ArrowLeftRight, group: 'navigation' },
  { id: 'nav-scenarios', label: 'Scenarios', description: 'Scenario analysis and modelling', icon: GitBranch, group: 'navigation', shortcut: '\u23184' },
  { id: 'nav-variance', label: 'Variance', description: 'Budget vs actual variance', icon: BarChart3, group: 'navigation' },
  { id: 'nav-budget', label: 'Budget vs Actual', description: 'Budget tracking and analysis', icon: Target, group: 'navigation' },
  { id: 'nav-trends', label: 'Trend Analysis', description: 'Multi-period trend analysis', icon: TrendingUp, group: 'navigation' },
  { id: 'nav-forecast', label: 'Cash Flow Forecast', description: 'Cash flow projections', icon: Coins, group: 'navigation' },
  { id: 'nav-fx-rates', label: 'FX Rates', description: 'Exchange rate management', icon: DollarSign, group: 'navigation', shortcut: '\u23185' },
  { id: 'nav-coa', label: 'Chart of Accounts', description: 'Group COA and mappings', icon: BookOpen, group: 'navigation' },
  { id: 'nav-reports', label: 'Reports', description: 'Generate financial reports', icon: FileText, group: 'navigation' },
  { id: 'nav-ai-insights', label: 'AI Insights', description: 'AI-powered financial analysis', icon: Sparkles, group: 'navigation', shortcut: '\u23186' },
  { id: 'nav-import', label: 'Data Import', description: 'CSV import wizard', icon: Upload, group: 'navigation' },
  { id: 'nav-audit', label: 'Audit Trail', description: 'Activity log and audit', icon: Clock, group: 'navigation' },
  { id: 'nav-settings', label: 'Settings', description: 'System configuration', icon: Settings, group: 'navigation' },
];

const viewIdMap: Record<string, ViewType> = {
  'nav-dashboard': 'dashboard',
  'nav-entities': 'entities',
  'nav-consolidation': 'consolidation',
  'nav-ic-transactions': 'ic-transactions',
  'nav-scenarios': 'scenarios',
  'nav-variance': 'variance',
  'nav-budget': 'budget',
  'nav-trends': 'trends',
  'nav-forecast': 'forecast',
  'nav-fx-rates': 'fx-rates',
  'nav-coa': 'coa',
  'nav-reports': 'reports',
  'nav-ai-insights': 'ai-insights',
  'nav-import': 'import',
  'nav-audit': 'audit',
  'nav-settings': 'settings',
};

// ============================================================
// Entity Items Definition (static - matches TechNova Group)
// ============================================================
const entityItems: Omit<PaletteItem, 'action'>[] = [
  { id: 'entity-pt', label: 'TechNova Portugal', description: 'PT0001 · Lisbon, Portugal · EUR', icon: Building2, group: 'entities' },
  { id: 'entity-es', label: 'TechNova España', description: 'ES0002 · Madrid, Spain · EUR', icon: Building2, group: 'entities' },
  { id: 'entity-de', label: 'TechNova Deutschland', description: 'DE0003 · Berlin, Germany · EUR', icon: Building2, group: 'entities' },
  { id: 'entity-uk', label: 'TechNova UK', description: 'UK0004 · London, United Kingdom · GBP', icon: Building2, group: 'entities' },
  { id: 'entity-fr', label: 'TechNova France', description: 'FR0005 · Paris, France · EUR', icon: Building2, group: 'entities' },
];

const entityViewMap: Record<string, ViewType> = {
  'entity-pt': 'entities',
  'entity-es': 'entities',
  'entity-de': 'entities',
  'entity-uk': 'entities',
  'entity-fr': 'entities',
};

// ============================================================
// Fuzzy Search Helper
// ============================================================
function fuzzyMatch(text: string, query: string): { match: boolean; score: number } {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // Exact substring match gets highest score
  if (lowerText.includes(lowerQuery)) {
    const index = lowerText.indexOf(lowerQuery);
    return { match: true, score: 1000 - index };
  }

  // Fuzzy character-by-character match
  let qi = 0;
  let score = 0;
  let lastMatchIndex = -1;

  for (let ti = 0; ti < lowerText.length && qi < lowerQuery.length; ti++) {
    if (lowerText[ti] === lowerQuery[qi]) {
      score += 10;
      // Bonus for consecutive matches
      if (lastMatchIndex === ti - 1) {
        score += 20;
      }
      // Bonus for matching at word boundaries
      if (ti === 0 || lowerText[ti - 1] === ' ' || lowerText[ti - 1] === '-') {
        score += 15;
      }
      lastMatchIndex = ti;
      qi++;
    }
  }

  return { match: qi === lowerQuery.length, score };
}

// ============================================================
// Highlight matching text helper
// ============================================================
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // Find the best match range for highlighting
  const exactIndex = lowerText.indexOf(lowerQuery);
  if (exactIndex !== -1) {
    return (
      <>
        {text.slice(0, exactIndex)}
        <span className="text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/30 rounded px-0.5">
          {text.slice(exactIndex, exactIndex + query.length)}
        </span>
        {text.slice(exactIndex + query.length)}
      </>
    );
  }

  // Fuzzy highlight: highlight each matched character
  const chars: { char: string; matched: boolean }[] = [];
  let qi = 0;
  for (let ti = 0; ti < text.length; ti++) {
    if (qi < lowerQuery.length && lowerText[ti] === lowerQuery[qi]) {
      chars.push({ char: text[ti], matched: true });
      qi++;
    } else {
      chars.push({ char: text[ti], matched: false });
    }
  }

  // Group consecutive matched/unmatched chars
  const parts: { text: string; matched: boolean }[] = [];
  let current = '';
  let currentMatched = false;

  for (const c of chars) {
    if (c.matched === currentMatched) {
      current += c.char;
    } else {
      if (current) parts.push({ text: current, matched: currentMatched });
      current = c.char;
      currentMatched = c.matched;
    }
  }
  if (current) parts.push({ text: current, matched: currentMatched });

  return (
    <>
      {parts.map((part, i) =>
        part.matched ? (
          <span key={i} className="text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/30 rounded px-0.5">
            {part.text}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

// ============================================================
// Group Header Component
// ============================================================
function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
        {label}
      </span>
      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
        {count}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// ============================================================
// Palette Item Component
// ============================================================
function PaletteItemRow({ item, query, onSelect }: { item: PaletteItem; query: string; onSelect: () => void }) {
  const Icon = item.icon;
  const [isSelected, setIsSelected] = useState(false);

  return (
    <Command.Item
      key={item.id}
      value={item.id}
      onSelect={onSelect}
      onMouseEnter={() => setIsSelected(true)}
      onMouseLeave={() => setIsSelected(false)}
      className={cn(
        'group flex items-center gap-3 px-3 py-2.5 mx-2 rounded-lg cursor-pointer',
        'text-sm text-foreground',
        'transition-colors duration-100',
        isSelected
          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-100'
          : 'hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20',
        'data-[selected=true]:bg-emerald-50 dark:data-[selected=true]:bg-emerald-950/30',
        'data-[selected=true]:text-emerald-900 dark:data-[selected=true]:text-emerald-100',
      )}
    >
      <div className={cn(
        'flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors duration-100',
        isSelected
          ? 'bg-emerald-100 dark:bg-emerald-900/40'
          : 'bg-muted/80',
      )}>
        <Icon className={cn(
          'w-4 h-4 transition-colors duration-100',
          isSelected
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-muted-foreground',
        )} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">
          <HighlightMatch text={item.label} query={query} />
        </div>
        <div className="text-xs text-muted-foreground truncate">
          <HighlightMatch text={item.description} query={query} />
        </div>
      </div>
      {item.shortcut && (
        <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground/70 bg-muted/60 border border-border/50 rounded shrink-0">
          {item.shortcut}
        </kbd>
      )}
      <CornerDownLeft className={cn(
        'w-3 h-3 text-emerald-500 shrink-0 transition-opacity duration-100',
        isSelected ? 'opacity-100' : 'opacity-0',
      )} />
    </Command.Item>
  );
}

// ============================================================
// Main Command Palette Component
// ============================================================
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { setActiveView, selectedPeriod, selectedScenario } = useAppStore();
  const { theme, setTheme } = useTheme();

  // Build actions items
  const actionsItems: Omit<PaletteItem, 'action'>[] = useMemo(() => [
    {
      id: 'action-consolidate',
      label: 'Run Consolidation',
      description: 'Execute consolidation for current period & scenario',
      icon: Play,
      group: 'actions' as const,
      shortcut: '\u21E7\u2318C',
    },
    {
      id: 'action-export-excel',
      label: 'Export to Excel',
      description: 'Export consolidated data to spreadsheet',
      icon: FileSpreadsheet,
      group: 'actions' as const,
      shortcut: '\u21E7\u2318E',
    },
    {
      id: 'action-generate-pdf',
      label: 'Generate PDF Report',
      description: 'Create a PDF financial report',
      icon: FileText,
      group: 'actions' as const,
      shortcut: '\u21E7\u2318P',
    },
    {
      id: 'action-toggle-theme',
      label: theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode',
      description: theme === 'dark' ? 'Change to light theme' : 'Change to dark theme',
      icon: theme === 'dark' ? Sun : Moon,
      group: 'actions' as const,
      shortcut: '\u21E7\u2318D',
    },
    {
      id: 'action-seed',
      label: 'Seed Database',
      description: 'Reset and populate with demo data',
      icon: Database,
      group: 'actions' as const,
    },
    {
      id: 'action-ai-insights',
      label: 'Go to AI Insights',
      description: 'Open AI-powered financial analysis',
      icon: Sparkles,
      group: 'actions' as const,
    },
  ], [theme]);

  // Build all items with actions bound
  const allItems: PaletteItem[] = useMemo(() => {
    const navItems: PaletteItem[] = navigationItems.map((item) => ({
      ...item,
      action: () => {
        const view = viewIdMap[item.id];
        if (view) {
          setActiveView(view);
          setOpen(false);
        }
      },
    }));

    const actItems: PaletteItem[] = actionsItems.map((item) => ({
      ...item,
      action: item.id === 'action-consolidate'
        ? async () => {
            try {
              const entities = await getEntities();
              const entityCodes = entities.map((e) => e.code);
              if (entityCodes.length === 0) throw new Error('No entities found');
              await runConsolidation({
                period: selectedPeriod,
                entityCodes,
                scenarioType: selectedScenario,
              });
              toast.success('Consolidation completed successfully');
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Consolidation failed');
            }
            setOpen(false);
          }
        : item.id === 'action-export-excel'
          ? () => {
              setActiveView('consolidation');
              setOpen(false);
              toast.info('Use the Export button in Consolidation view');
            }
          : item.id === 'action-generate-pdf'
            ? () => {
                setActiveView('reports');
                setOpen(false);
                toast.info('Use the Generate button in Reports view');
              }
            : item.id === 'action-toggle-theme'
              ? () => {
                  setTheme(theme === 'dark' ? 'light' : 'dark');
                  setOpen(false);
                }
              : item.id === 'action-seed'
                ? async () => {
                    try {
                      await seedDatabase();
                      toast.success('Database seeded with demo data');
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Seeding failed');
                    }
                    setOpen(false);
                  }
                : item.id === 'action-ai-insights'
                  ? () => {
                      setActiveView('ai-insights');
                      setOpen(false);
                    }
                  : () => setOpen(false),
    }));

    const entItems: PaletteItem[] = entityItems.map((item) => ({
      ...item,
      action: () => {
        const view = entityViewMap[item.id];
        if (view) {
          setActiveView(view);
          setOpen(false);
          toast.info(`Viewing ${item.label}`);
        }
      },
    }));

    return [...navItems, ...actItems, ...entItems];
  }, [actionsItems, setActiveView, selectedPeriod, selectedScenario, theme, setTheme]);

  // Filter items with fuzzy search
  const filteredItems = useMemo(() => {
    if (!query.trim()) return allItems;

    const results = allItems
      .map((item) => {
        const labelMatch = fuzzyMatch(item.label, query);
        const descMatch = fuzzyMatch(item.description, query);
        const bestScore = Math.max(labelMatch.score, descMatch.score);
        const matched = labelMatch.match || descMatch.match;
        return { item, score: bestScore, matched };
      })
      .filter((r) => r.matched)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item);

    return results;
  }, [allItems, query]);

  // Group filtered items
  const groupedItems = useMemo(() => {
    const groups: Record<string, PaletteItem[]> = {
      navigation: [],
      actions: [],
      entities: [],
    };

    filteredItems.forEach((item) => {
      groups[item.group]?.push(item);
    });

    return groups;
  }, [filteredItems]);

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Reset query when closing
  useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);

  // Auto-focus input when opening
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [open]);

  const handleSelect = useCallback((item: PaletteItem) => {
    item.action();
  }, []);

  const hasResults = filteredItems.length > 0;
  const groupOrder: Array<{ key: string; label: string }> = [
    { key: 'navigation', label: 'Navigation' },
    { key: 'actions', label: 'Actions' },
    { key: 'entities', label: 'Entities' },
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Dialog */}
          <div className="fixed inset-0 z-[101] flex items-start justify-center pt-[15vh] sm:pt-[20vh] px-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <Command
                className="flex flex-col"
                loop
                shouldFilter={false}
              >
                {/* Search Input */}
                <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                  <Search className="w-5 h-5 text-muted-foreground shrink-0" />
                  <Command.Input
                    ref={inputRef}
                    value={query}
                    onValueChange={setQuery}
                    placeholder="Search views, actions, entities..."
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setOpen(false);
                      }
                    }}
                  />
                  {query && (
                    <button
                      onClick={() => setQuery('')}
                      className="shrink-0 p-0.5 rounded-md hover:bg-muted transition-colors"
                    >
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  )}
                  <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-muted border border-border rounded shrink-0">
                    esc
                  </kbd>
                </div>

                {/* Results */}
                <Command.List className="max-h-80 overflow-y-auto custom-scrollbar py-1">
                  {!hasResults && (
                    <div className="flex flex-col items-center justify-center py-12 px-4">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                        <Search className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">No results found</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        Try a different search term
                      </p>
                    </div>
                  )}

                  {groupOrder.map(({ key, label }) => {
                    const items = groupedItems[key];
                    if (!items || items.length === 0) return null;

                    return (
                      <Command.Group key={key} heading="">
                        <GroupHeader label={label} count={items.length} />
                        {items.map((item) => (
                          <PaletteItemRow
                            key={item.id}
                            item={item}
                            query={query}
                            onSelect={() => handleSelect(item)}
                          />
                        ))}
                      </Command.Group>
                    );
                  })}
                </Command.List>

                {/* Footer hint */}
                <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono border border-border/50">↑↓</kbd>
                      navigate
                    </span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono border border-border/50">↵</kbd>
                      select
                    </span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono border border-border/50">esc</kbd>
                      close
                    </span>
                  </div>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono border border-border/50">⌘K</kbd>
                    to toggle
                  </span>
                </div>
              </Command>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
