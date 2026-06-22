'use client';

import { useAppStore } from '@/lib/store';
import { AppSidebar, MobileMenuButton } from '@/components/sidebar';
import { DashboardView } from '@/components/dashboard-view';
import { EntitiesView } from '@/components/entities-view';
import { ConsolidationView } from '@/components/consolidation-view';
import { ScenariosView } from '@/components/scenarios-view';
import { VarianceView } from '@/components/variance-view';
import { FxRatesView } from '@/components/fx-rates-view';
import { COAView } from '@/components/coa-view';
import { DataImportView } from '@/components/data-import-view';
import { AuditTrailView } from '@/components/audit-trail-view';
import { ICTransactionsView } from '@/components/ic-transactions-view';
import { ReportsView } from '@/components/reports-view';
import { BudgetVsActualView } from '@/components/budget-vs-actual-view';
import { SettingsView } from '@/components/settings-view';
import { TrendAnalysisView } from '@/components/trend-analysis-view';
import { CashFlowForecastView } from '@/components/cash-flow-forecast-view';
import { AIInsightsView } from '@/components/ai-insights-view';
import { ComplianceView } from '@/components/compliance-view';
import { JournalEntryView } from '@/components/journal-entry-view';
import { WorkflowView } from '@/components/workflow-view';
import { ProjectsView } from '@/components/projects-view';
import { OperationsView } from '@/components/operations-view';
import { GroupSelectScreen } from '@/components/group-select-screen';
import { NotificationCenter } from '@/components/notification-center';
import { CommandPalette } from '@/components/command-palette';
import { LocaleToggle } from '@/components/locale-toggle';
import { AuthStatus } from '@/components/auth-status';
import { useTranslations, useLocale } from 'next-intl';
import { dateLocale, type Locale } from '@/i18n/locale-context';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { availablePeriods } from '@/lib/demo-data';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Clock, ShieldCheck, Database, ChevronRight, Command, LayoutDashboard, Building2, Layers, GitBranch, BarChart3, Target, TrendingUp, DollarSign, BookOpen, Upload, ArrowLeftRight, FileText, Settings, Coins, Sparkles, Shield, PenLine, Workflow, Rocket, Factory } from 'lucide-react';

const viewIconMap: Record<string, React.ElementType> = {
  dashboard: LayoutDashboard,
  entities: Building2,
  consolidation: Layers,
  scenarios: GitBranch,
  variance: BarChart3,
  budget: Target,
  trends: TrendingUp,
  forecast: Coins,
  projects: Rocket,
  operations: Factory,
  'fx-rates': DollarSign,
  coa: BookOpen,
  'ic-transactions': ArrowLeftRight,
  reports: FileText,
  'ai-insights': Sparkles,
  compliance: Shield,
  journal: PenLine,
  workflow: Workflow,
  import: Upload,
  audit: Clock,
  settings: Settings,
};

const scenarioColors: Record<string, string> = {
  base: 'bg-muted text-muted-foreground',
  optimistic: 'bg-gain/10 text-gain',
  pessimistic: 'bg-loss/10 text-loss',
};

export default function Home() {
  const { activeView, selectedPeriod, setSelectedPeriod, selectedScenario, setSelectedScenario, selectedCompany, setSelectedCompany } = useAppStore();
  const t = useTranslations('header');
  const tFooter = useTranslations('footer');
  const tView = useTranslations('viewTitles');
  const tScenario = useTranslations('scenario');
  const loc = useLocale() as Locale;

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <DashboardView />;
      case 'entities':
        return <EntitiesView />;
      case 'consolidation':
        return <ConsolidationView />;
      case 'scenarios':
        return <ScenariosView />;
      case 'variance':
        return <VarianceView />;
      case 'fx-rates':
        return <FxRatesView />;
      case 'coa':
        return <COAView />;
      case 'import':
        return <DataImportView />;
      case 'ic-transactions':
        return <ICTransactionsView />;
      case 'reports':
        return <ReportsView />;
      case 'ai-insights':
        return <AIInsightsView />;
      case 'compliance':
        return <ComplianceView />;
      case 'journal':
        return <JournalEntryView />;
      case 'workflow':
        return <WorkflowView />;
      case 'budget':
        return <BudgetVsActualView />;
      case 'trends':
        return <TrendAnalysisView />;
      case 'forecast':
        return <CashFlowForecastView />;
      case 'projects':
        return <ProjectsView />;
      case 'operations':
        return <OperationsView />;
      case 'audit':
        return <AuditTrailView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  };

  const scenarioColor = scenarioColors[selectedScenario] || scenarioColors.base;
  const periodLabel = new Date(selectedPeriod + '-01').toLocaleDateString(dateLocale(loc), { year: 'numeric', month: 'short' });

  // Group selection gate: show the group picker until a group is loaded
  if (!selectedCompany) {
    return <GroupSelectScreen />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background bg-grid-pattern">
      <CommandPalette />
      <div className="flex flex-1">
        {/* Sidebar */}
        <AppSidebar />

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Enhanced Header with gradient border */}
          <header className="sticky top-0 z-30 glass-card-premium px-4 lg:px-6 h-14 flex items-center justify-between gap-4">
            {/* Animated accent hairline at top */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-signal to-transparent animated-gradient-line" />

            <div className="flex items-center gap-3">
              <MobileMenuButton />
              {/* Breadcrumbs with enhanced styling */}
              <Breadcrumb className="hidden sm:flex">
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink className="text-xs text-signal cursor-pointer hover:opacity-80 transition-opacity font-medium" onClick={() => useAppStore.getState().setActiveView('dashboard')}>
                      ConsolidaçãoFX
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator>
                    <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
                  </BreadcrumbSeparator>
                  <BreadcrumbItem>
                    <BreadcrumbPage className="text-xs font-semibold text-foreground flex items-center gap-1">
                      {(() => {
                        const Icon = viewIconMap[activeView];
                        return Icon ? <Icon className="w-3 h-3 text-signal" /> : null;
                      })()}
                      {tView(activeView)}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <Badge
                variant="outline"
                className="flex text-[10px] gap-1 cursor-pointer hover:border-signal/50 hover:text-signal transition-colors max-w-44"
                onClick={() => setSelectedCompany(null)}
                title={t('switchGroup')}
              >
                {selectedCompany.code === 'GROUP' ? <Layers className="w-3 h-3 shrink-0" /> : <Building2 className="w-3 h-3 shrink-0" />}
                <span className="truncate">{selectedCompany.name}</span>
                <ChevronRight className="w-3 h-3 shrink-0 rotate-90 opacity-60" />
              </Badge>
              <Badge variant="outline" className="hidden md:flex text-[10px] font-mono gap-1 tabular-nums text-muted-foreground">
                <Clock className="w-3 h-3" />
                {periodLabel}
              </Badge>
              <Badge className={`hidden md:flex text-[10px] ${scenarioColor}`}>
                {tScenario(selectedScenario)}
              </Badge>
              <span className="hidden lg:flex text-[10px] text-muted-foreground items-center gap-1">
                <Activity className="w-3 h-3 text-signal" />
                {t('dataAsOf', { date: 'Dec 2024' })}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {/* Account / role indicator + logout */}
              <AuthStatus />
              {/* Language toggle */}
              <LocaleToggle />
              {/* Enhanced System Status */}
              <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted px-2 py-1 rounded-md">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gain opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-gain" />
                </span>
                <span className="text-gain font-medium">{t('allSystemsOperational')}</span>
              </div>
              {/* Notification Center */}
              <div className="relative">
                <NotificationCenter />
                {/* Static notification count badge when no unread from API - always show a subtle indicator */}
              </div>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availablePeriods.slice(0, 6).map((p) => (
                    <SelectItem key={p} value={p}>
                      {new Date(p + '-01').toLocaleDateString(dateLocale(loc), { year: 'numeric', month: 'short' })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedScenario} onValueChange={setSelectedScenario}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="base">{tScenario('base')}</SelectItem>
                  <SelectItem value="optimistic">{tScenario('optimistic')}</SelectItem>
                  <SelectItem value="pessimistic">{tScenario('pessimistic')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </header>

          {/* Content Area with custom scrollbar */}
          <main className="flex-1 p-4 lg:p-6 overflow-y-auto custom-scrollbar">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeView}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                {renderView()}
              </motion.div>
            </AnimatePresence>
          </main>

          {/* Enhanced Footer with gradient border and updated version */}
          <footer className="relative border-t glass-card-premium px-4 lg:px-6 py-3">
            {/* Hairline at top of footer */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
            {/* Animated accent line at bottom */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-signal to-transparent animate-gradient" />
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-4">
                <p className="text-xs text-muted-foreground font-medium">
                  ConsolidaçãoFX © 2025
                </p>
                <div className="h-3 w-px bg-border hidden sm:block" />
                <p className="text-[10px] text-muted-foreground hidden sm:block">
                  {tFooter('tagline')}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Command className="w-3 h-3 text-signal" />
                  <span>{tFooter('quickSearch')}</span>
                </div>
                <div className="h-3 w-px bg-border hidden sm:block" />
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <ShieldCheck className="w-3 h-3 text-signal" />
                  <span>{tFooter('lastSync', { date: 'Dec 2024' })}</span>
                </div>
                <div className="h-3 w-px bg-border hidden sm:block" />
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Database className="w-3 h-3 text-signal" />
                  <span className="hidden sm:inline">{tFooter('database', { entities: 5 })}</span>
                  <span className="sm:hidden">{tFooter('entitiesShort', { entities: 5 })}</span>
                </div>
                <div className="h-3 w-px bg-border hidden sm:block" />
                <Badge variant="outline" className="text-[9px] font-mono tabular-nums text-muted-foreground">v3.2.0</Badge>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
