'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Workflow, CheckCircle2, Clock, Loader2, ChevronRight, Play, RotateCcw,
  ArrowRight, Zap, Timer, TrendingUp, LayoutList,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useAppStore, type ViewType } from '@/lib/store';
import { getWorkflow } from '@/lib/api';
import { WorkflowStep, WorkflowData } from '@/lib/types';
import { DataLoadError } from '@/components/data-load-error';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================
// DEMO DATA
// ============================================================
const demoWorkflow: WorkflowData = {
  steps: [
    {
      id: 'step-1',
      name: 'Load Entity Data',
      status: 'complete',
      completedAt: '2024-12-01T08:30:00Z',
      description: 'Load and validate entity master data including legal names, currencies, consolidation methods, and ownership percentages.',
      metrics: '5 entities loaded',
      navigateTo: 'entities',
      navigateLabel: 'Go to Entities',
    },
    {
      id: 'step-2',
      name: 'Import Trial Balances',
      status: 'complete',
      completedAt: '2024-12-02T14:15:00Z',
      description: 'Import trial balance data from all subsidiary ERPs for the selected period. Data includes account balances in local currency and EUR.',
      metrics: '3,540 trial balance records',
      navigateTo: 'import',
      navigateLabel: 'Go to Data Import',
    },
    {
      id: 'step-3',
      name: 'Update FX Rates',
      status: 'complete',
      completedAt: '2024-12-03T09:45:00Z',
      description: 'Update exchange rates for all relevant currency pairs. Rates are used for currency conversion of non-EUR entities (e.g., GBP for UK subsidiary).',
      metrics: '14 exchange rates loaded',
      navigateTo: 'fx-rates',
      navigateLabel: 'Go to FX Rates',
    },
    {
      id: 'step-4',
      name: 'Run IC Eliminations',
      status: 'complete',
      completedAt: '2024-12-04T16:20:00Z',
      description: 'Identify and eliminate intercompany transactions including IC revenue, IC expenses, IC receivables, and IC payables to produce clean consolidated figures.',
      metrics: '8 of 8 transactions eliminated',
      navigateTo: 'ic-transactions',
      navigateLabel: 'Go to IC Transactions',
    },
    {
      id: 'step-5',
      name: 'Run Consolidation',
      status: 'in_progress',
      completedAt: null,
      description: 'Execute the full consolidation process: aggregate financial statements across entities, apply currency conversions, eliminate IC balances, and compute minority interest.',
      metrics: 'Processing…',
      navigateTo: 'consolidation',
      navigateLabel: 'Go to Consolidation',
    },
    {
      id: 'step-6',
      name: 'Generate Reports',
      status: 'pending',
      completedAt: null,
      description: 'Generate consolidated financial reports including Income Statement, Balance Sheet, Cash Flow Statement, and regulatory compliance reports.',
      metrics: 'No reports generated',
      navigateTo: 'reports',
      navigateLabel: 'Go to Reports',
    },
  ],
  overallProgress: 67,
  lastCompletedStep: 'Run IC Eliminations',
  estimatedTimeRemaining: '~4 min (1 in progress)',
};

// ============================================================
// STEP STATUS ICON
// ============================================================
function StepStatusIcon({ status }: { status: WorkflowStep['status'] }) {
  switch (status) {
    case 'complete':
      return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
    case 'in_progress':
      return <Loader2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 animate-spin" />;
    case 'pending':
      return <Clock className="w-5 h-5 text-slate-400 dark:text-slate-500" />;
  }
}

// ============================================================
// STEP STATUS BADGE
// ============================================================
function StepStatusBadge({ status }: { status: WorkflowStep['status'] }) {
  const config = {
    complete: { label: 'Complete', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    in_progress: { label: 'In Progress', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    pending: { label: 'Pending', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400' },
  };
  const c = config[status];
  return <Badge className={`text-[10px] ${c.className}`}>{c.label}</Badge>;
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export function WorkflowView() {
  const { selectedPeriod, setActiveView } = useAppStore();
  const [workflow, setWorkflow] = useState<WorkflowData>(demoWorkflow);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState<string | null>('step-5');

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await getWorkflow({ period: selectedPeriod });
      if (data?.steps?.length > 0) setWorkflow(data);
    } catch (err) {
      console.error('Failed to load workflow data', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedStep = workflow.steps.find((s) => s.id === selectedStepId) || null;

  // Find the current active step (first in_progress or first pending after last complete)
  const currentStepIdx = workflow.steps.findIndex((s) => s.status === 'in_progress');
  const firstPendingIdx = workflow.steps.findIndex((s) => s.status === 'pending');
  const activeStepIdx = currentStepIdx >= 0 ? currentStepIdx : firstPendingIdx;

  return (
    <div className="space-y-6">
      {loadError && <DataLoadError />}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Workflow className="w-5 h-5 text-emerald-600" />
            Consolidation Workflow Tracker
          </h2>
          <p className="text-sm text-muted-foreground">Step-by-step wizard guiding the multi-company consolidation process</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400 text-xs">
            {new Date(selectedPeriod + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
          </Badge>
        </div>
      </div>

      {/* Workflow Summary Card */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="shadow-sm bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-950/20 dark:to-slate-900">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                    <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Overall Progress</p>
                    <p className="text-xs text-muted-foreground">
                      {workflow.lastCompletedStep
                        ? `Last completed: ${workflow.lastCompletedStep}`
                        : 'No steps completed yet'}
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{workflow.overallProgress}% complete</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      {workflow.steps.filter((s) => s.status === 'complete').length} of {workflow.steps.length} steps
                    </span>
                  </div>
                  <Progress value={workflow.overallProgress} className="h-2.5 [&>div]:bg-gradient-to-r [&>div]:from-emerald-500 [&>div]:to-teal-500" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-center px-4 py-2 bg-white/60 dark:bg-slate-800/50 rounded-lg">
                  <Timer className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mx-auto mb-1" />
                  <p className="text-[10px] text-muted-foreground">Est. Time</p>
                  <p className="text-xs font-semibold">{workflow.estimatedTimeRemaining}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Gradient Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-emerald-300 dark:via-emerald-700 to-transparent" />

      {/* 6-Step Progress Bar */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <LayoutList className="w-4 h-4 text-emerald-600" />
              Consolidation Steps
            </CardTitle>
            <CardDescription>Click on any step to view details and navigate to the relevant module</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-between gap-2 py-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2">
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-start justify-between gap-1 sm:gap-2 py-2">
                {workflow.steps.map((step, idx) => {
                  const isActive = idx === activeStepIdx;
                  const isSelected = step.id === selectedStepId;
                  return (
                    <div key={step.id} className="flex-1 flex flex-col items-center relative">
                      {/* Connector line */}
                      {idx < workflow.steps.length - 1 && (
                        <div className="absolute top-5 left-1/2 w-full h-0.5 z-0">
                          <div
                            className={`h-full ${
                              step.status === 'complete' && workflow.steps[idx + 1].status !== 'pending'
                                ? 'bg-emerald-400 dark:bg-emerald-600'
                                : 'bg-slate-200 dark:bg-slate-700'
                            }`}
                          />
                        </div>
                      )}
                      {/* Step circle */}
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setSelectedStepId(step.id)}
                        className={`
                          relative z-10 w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm
                          transition-all duration-300 border-2
                          ${step.status === 'complete'
                            ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                            : step.status === 'in_progress'
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500 text-emerald-600 dark:text-emerald-400 shadow-lg shadow-emerald-500/20 animate-pulse'
                            : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500'
                          }
                          ${isSelected ? 'ring-2 ring-emerald-400 ring-offset-2 dark:ring-offset-slate-900' : ''}
                        `}
                      >
                        {step.status === 'complete' ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          <span>{idx + 1}</span>
                        )}
                      </motion.button>
                      {/* Step name */}
                      <p className={`text-[10px] sm:text-xs font-medium mt-2 text-center leading-tight max-w-[80px] ${
                        step.status === 'complete'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : step.status === 'in_progress'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}>
                        {step.name}
                      </p>
                      {/* Completion time */}
                      {step.completedAt && (
                        <p className="text-[9px] text-muted-foreground mt-0.5">
                          {new Date(step.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Step Detail Cards + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Selected Step Detail */}
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <AnimatePresence mode="wait">
            {selectedStep && (
              <motion.div
                key={selectedStep.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.25 }}
              >
                <Card className={`shadow-sm border border-slate-200/60 dark:border-slate-700/40 ${
                  selectedStep.status === 'complete'
                    ? 'border-emerald-200 dark:border-emerald-800/50'
                    : selectedStep.status === 'in_progress'
                    ? 'border-amber-200 dark:border-amber-800/50'
                    : 'border-slate-200 dark:border-slate-700'
                }`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <StepStatusIcon status={selectedStep.status} />
                        <div>
                          <CardTitle className="text-base">{selectedStep.name}</CardTitle>
                          <CardDescription>Step {workflow.steps.indexOf(selectedStep) + 1} of {workflow.steps.length}</CardDescription>
                        </div>
                      </div>
                      <StepStatusBadge status={selectedStep.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Description */}
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {selectedStep.description}
                    </p>

                    {/* Gradient Divider */}
                    <div className="h-px bg-gradient-to-r from-transparent via-emerald-300 dark:via-emerald-700 to-transparent" />

                    {/* Metrics */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-950/20 dark:to-slate-900 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-1">Current Status</p>
                        <p className="font-semibold text-sm flex items-center gap-2">
                          <StepStatusIcon status={selectedStep.status} />
                          {selectedStep.status === 'complete' ? 'Completed' : selectedStep.status === 'in_progress' ? 'In Progress' : 'Pending'}
                        </p>
                      </div>
                      <div className="bg-gradient-to-br from-teal-50/80 to-white dark:from-teal-950/20 dark:to-slate-900 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-1">Metrics</p>
                        <p className="font-semibold text-sm">{selectedStep.metrics || '—'}</p>
                      </div>
                    </div>

                    {/* Completed time */}
                    {selectedStep.completedAt && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" />
                        Completed on {new Date(selectedStep.completedAt).toLocaleDateString('en-US', {
                          year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </div>
                    )}

                    {/* Navigate button */}
                    {selectedStep.navigateTo && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                        onClick={() => {
                          if (selectedStep.navigateTo) {
                            setActiveView(selectedStep.navigateTo as ViewType);
                          }
                        }}
                      >
                        {selectedStep.navigateLabel || 'Navigate'}
                        <ArrowRight className="w-4 h-4 ml-1" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Quick Actions + All Steps Summary */}
        <motion.div
          className="space-y-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          {/* Quick Actions */}
          <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-600" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                onClick={() => setActiveView('consolidation')}
              >
                <Play className="w-4 h-4 mr-2" />
                Run Full Workflow
              </Button>
              <Button
                variant="outline"
                className="w-full border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400"
                onClick={() => setActiveView('consolidation')}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Re-run Failed Steps
              </Button>
            </CardContent>
          </Card>

          {/* All Steps Summary */}
          <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
            <CardHeader>
              <CardTitle className="text-sm">Steps Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {workflow.steps.map((step, idx) => (
                <motion.button
                  key={step.id}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                    selectedStepId === step.id ? 'bg-emerald-50 dark:bg-emerald-950/20 ring-1 ring-emerald-500/30' : ''
                  }`}
                  onClick={() => setSelectedStepId(step.id)}
                >
                  <StepStatusIcon status={step.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{step.name}</p>
                    <p className="text-[10px] text-muted-foreground">{step.metrics || '—'}</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                </motion.button>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
