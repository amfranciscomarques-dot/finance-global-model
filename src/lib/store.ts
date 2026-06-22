import { create } from 'zustand';

export type ViewType = 'dashboard' | 'entities' | 'consolidation' | 'scenarios' | 'variance' | 'budget' | 'trends' | 'forecast' | 'fx-rates' | 'coa' | 'import' | 'audit' | 'ic-transactions' | 'reports' | 'ai-insights' | 'compliance' | 'settings' | 'journal' | 'workflow' | 'projects' | 'operations';

export interface SelectedCompany {
  code: string;
  name: string;
}

interface AppState {
  activeView: ViewType;
  selectedPeriod: string;
  selectedScenario: string;
  selectedCompany: SelectedCompany | null;
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  setActiveView: (view: ViewType) => void;
  setSelectedPeriod: (period: string) => void;
  setSelectedScenario: (scenario: string) => void;
  setSelectedCompany: (company: SelectedCompany | null) => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeView: 'dashboard',
  selectedPeriod: '2024-12',
  selectedScenario: 'base',
  selectedCompany: null,
  sidebarOpen: false,
  sidebarCollapsed: false,
  setActiveView: (view) => set({ activeView: view }),
  setSelectedCompany: (company) => set({ selectedCompany: company }),
  setSelectedPeriod: (period) => set({ selectedPeriod: period }),
  setSelectedScenario: (scenario) => set({ selectedScenario: scenario }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
}));
