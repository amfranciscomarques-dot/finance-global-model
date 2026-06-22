'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Settings,
  Database,
  Server,
  Building2,
  Activity,
  Save,
  RefreshCw,
  Download,
  Upload,
  Trash2,
  Plus,
  AlertTriangle,
  XCircle,
  Globe,
  DollarSign,
  Shield,
  Info,
  Cpu,
  HardDrive,
  Clock,
  Zap,
  ArrowRight,
  FileDown,
  FileUp,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { getSettings, updateSettings } from '@/lib/api';
import { SystemSettings, CurrencyPair } from '@/lib/types';
import { DataLoadError } from '@/components/data-load-error';
import { LocaleToggle } from '@/components/locale-toggle';
import { useTranslations } from 'next-intl';
import {
  demoSettings,
  demoCurrencyPairs,
  demoApiEndpoints,
  demoVersionHistory,
  demoTableCounts,
  defaultEnvironmentInfo,
  buildTableCounts,
  makeValidationRuleId,
  makeCurrencyPairId,
  countActiveRules,
  countHealthyEndpoints,
} from '@/components/settings/helpers';
import { toast } from 'sonner';

export function SettingsView() {
  const tCommon = useTranslations('common');
  const [settings, setSettings] = useState<SystemSettings>(demoSettings);
  const [loadError, setLoadError] = useState(false);
  const [currencyPairs, setCurrencyPairs] = useState<CurrencyPair[]>(demoCurrencyPairs);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('consolidation');
  const [newRuleDialog, setNewRuleDialog] = useState(false);
  const [newPairDialog, setNewPairDialog] = useState(false);

  // Form states
  const [consolidationForm, setConsolidationForm] = useState(demoSettings.consolidation);
  const [currencyForm, setCurrencyForm] = useState({
    ...demoSettings.currency,
    exchangeRateProvider: 'ECB',
  });
  const [validationRulesForm, setValidationRulesForm] = useState(demoSettings.validationRules);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleScope, setNewRuleScope] = useState('all');
  const [newRuleSeverity, setNewRuleSeverity] = useState<'error' | 'warning'>('warning');
  const [newRuleDescription, setNewRuleDescription] = useState('');
  const [newPairFrom, setNewPairFrom] = useState('GBP');
  const [newPairTo, setNewPairTo] = useState('EUR');
  const [newPairRateType, setNewPairRateType] = useState('Closing');

  // API data from settings
  const [apiEndpoints, setApiEndpoints] = useState(demoApiEndpoints);
  const [versionHistory, setVersionHistory] = useState(demoVersionHistory);
  const [tableCounts, setTableCounts] = useState(demoTableCounts);
  const [environmentInfo, setEnvironmentInfo] = useState(defaultEnvironmentInfo);

  useEffect(() => {
    async function loadSettings() {
      setLoadError(false);
      try {
        const data = await getSettings();
        setSettings(data);
        setConsolidationForm(data.consolidation);
        setCurrencyForm({
          ...data.currency,
          exchangeRateProvider: data.currency.exchangeRateProvider || 'ECB',
        });
        setValidationRulesForm(data.validationRules);
        if (data.system.apiEndpoints) {
          setApiEndpoints(data.system.apiEndpoints);
        }
        if (data.system.versionHistory) {
          setVersionHistory(data.system.versionHistory);
        }
        if (data.system.environment) {
          setEnvironmentInfo(data.system.environment);
        }
        // Build table counts from system data
        const tableCountsFromSys = buildTableCounts(data.system);
        if (tableCountsFromSys) {
          setTableCounts(tableCountsFromSys);
        }
      } catch (err) {
        console.error('Failed to load settings', err);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleSaveConsolidation = useCallback(async () => {
    setSaving('consolidation');
    try {
      await updateSettings('consolidation', consolidationForm);
      toast.success('Consolidation settings saved successfully');
    } catch {
      toast.error('Failed to save consolidation settings');
    } finally {
      setSaving(null);
    }
  }, [consolidationForm]);

  const handleSaveCurrency = useCallback(async () => {
    setSaving('currency');
    try {
      await updateSettings('currency', currencyForm);
      toast.success('Currency settings saved successfully');
    } catch {
      toast.error('Failed to save currency settings');
    } finally {
      setSaving(null);
    }
  }, [currencyForm]);

  const handleToggleRule = useCallback(async (ruleId: string) => {
    const updatedRules = validationRulesForm.map(r =>
      r.id === ruleId ? { ...r, isActive: !r.isActive } : r
    );
    setValidationRulesForm(updatedRules);
    try {
      await updateSettings('validation', { rules: updatedRules });
      toast.success('Validation rule updated');
    } catch {
      toast.error('Failed to update validation rule');
    }
  }, [validationRulesForm]);

  const handleBulkToggle = useCallback(async (enable: boolean) => {
    const updatedRules = validationRulesForm.map(r => ({ ...r, isActive: enable }));
    setValidationRulesForm(updatedRules);
    try {
      await updateSettings('validation', { bulkToggle: enable });
      toast.success(`All rules ${enable ? 'enabled' : 'disabled'}`);
    } catch {
      toast.error('Failed to update rules');
    }
  }, [validationRulesForm]);

  const handleAddRule = useCallback(async () => {
    if (!newRuleName.trim()) {
      toast.error('Rule name is required');
      return;
    }
    const newRule = {
      name: newRuleName,
      entityScope: newRuleScope,
      severity: newRuleSeverity,
      isActive: true,
      description: newRuleDescription,
    };
    const updatedRules = [
      ...validationRulesForm,
      { id: makeValidationRuleId(validationRulesForm.length), ...newRule },
    ];
    setValidationRulesForm(updatedRules);
    try {
      await updateSettings('validation', { newRule });
      toast.success('Validation rule added');
    } catch {
      toast.error('Failed to add validation rule');
    }
    setNewRuleDialog(false);
    setNewRuleName('');
    setNewRuleDescription('');
  }, [newRuleName, newRuleScope, newRuleSeverity, newRuleDescription, validationRulesForm]);

  const handleAddCurrencyPair = useCallback(() => {
    const newPair: CurrencyPair = {
      id: makeCurrencyPairId(currencyPairs.length),
      fromCurrency: newPairFrom,
      toCurrency: newPairTo,
      rateType: newPairRateType,
      lastUpdated: new Date().toISOString().split('T')[0],
      source: currencyForm.exchangeRateProvider || 'ECB',
    };
    setCurrencyPairs([...currencyPairs, newPair]);
    setNewPairDialog(false);
    toast.success('Currency pair added');
  }, [newPairFrom, newPairTo, newPairRateType, currencyPairs, currencyForm.exchangeRateProvider]);

  const handleExportRules = useCallback(() => {
    const data = JSON.stringify(validationRulesForm, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'validation-rules.json';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Validation rules exported');
  }, [validationRulesForm]);

  const handleImportRules = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const rules = JSON.parse(text);
        setValidationRulesForm(rules);
        await updateSettings('validation', { rules });
        toast.success('Validation rules imported');
      } catch {
        toast.error('Invalid JSON file');
      }
    };
    input.click();
  }, []);

  const handleClearCache = useCallback(() => {
    toast.success('Cache cleared successfully');
  }, []);

  const handleResetDemo = useCallback(async () => {
    try {
      await updateSettings('system', { resetDemoData: true });
      toast.success('Demo data reset to defaults');
    } catch {
      toast.error('Failed to reset demo data');
    }
  }, []);

  const handleExportDatabase = useCallback(() => {
    toast.success('Database export started — download will begin shortly');
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const activeRules = countActiveRules(validationRulesForm);
  const healthyEndpoints = countHealthyEndpoints(apiEndpoints);

  return (
    <div className="space-y-6">
      {loadError && <DataLoadError />}
      {/* Gradient Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />

      {/* Interface preferences — language toggle */}
      <Card className="border border-border">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-signal/10 text-signal shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">{tCommon('interfaceLanguage')}</p>
              <p className="text-xs text-muted-foreground max-w-md">{tCommon('interfaceLanguageHint')}</p>
            </div>
          </div>
          <LocaleToggle className="self-start sm:self-auto" />
        </CardContent>
      </Card>

      {/* System Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
        >
          <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 border-emerald-200/50 dark:border-emerald-800/30 hover:shadow-lg hover:shadow-emerald-500/5 transition-all">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Database Status</p>
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">SQLite</p>
                  <p className="text-xs text-emerald-500/80 dark:text-emerald-400/60 mt-1">
                    {settings.system.dbSize} · {settings.system.recordCount.toLocaleString()} records
                  </p>
                </div>
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10">
                  <Database className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Online</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <Card className="bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-950/40 dark:to-cyan-950/40 border-teal-200/50 dark:border-teal-800/30 hover:shadow-lg hover:shadow-teal-500/5 transition-all">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-teal-600 dark:text-teal-400 uppercase tracking-wider">System Version</p>
                  <p className="text-2xl font-bold text-teal-700 dark:text-teal-300 mt-1">v{settings.system.version}</p>
                  <p className="text-xs text-teal-500/80 dark:text-teal-400/60 mt-1">
                    Last update: {versionHistory[0]?.date || '2025-01-15'}
                  </p>
                </div>
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-teal-500/10">
                  <Server className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                </div>
              </div>
              <div className="mt-3">
                <Badge className="text-[9px] bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">
                  {environmentInfo.platform}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-gradient-to-br from-cyan-50 to-emerald-50 dark:from-cyan-950/40 dark:to-emerald-950/40 border-cyan-200/50 dark:border-cyan-800/30 hover:shadow-lg hover:shadow-cyan-500/5 transition-all">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-cyan-600 dark:text-cyan-400 uppercase tracking-wider">Active Entities</p>
                  <p className="text-2xl font-bold text-cyan-700 dark:text-cyan-300 mt-1">{tableCounts[0]?.count || 5}</p>
                  <p className="text-xs text-cyan-500/80 dark:text-cyan-400/60 mt-1">
                    {activeRules} validation rules active
                  </p>
                </div>
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-500/10">
                  <Building2 className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                </div>
              </div>
              <div className="mt-3">
                <Badge className="text-[9px] bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400">
                  Consolidation Ready
                </Badge>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/40 dark:to-green-950/40 border-emerald-200/50 dark:border-emerald-800/30 hover:shadow-lg hover:shadow-emerald-500/5 transition-all">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">API Health</p>
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">{healthyEndpoints}/{apiEndpoints.length}</p>
                  <p className="text-xs text-emerald-500/80 dark:text-emerald-400/60 mt-1">
                    All endpoints operational
                  </p>
                </div>
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10">
                  <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Healthy</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Tab Navigation */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-slate-100 dark:bg-slate-800/50 p-1 rounded-xl">
            <TabsTrigger value="consolidation" className="rounded-lg data-[state=active]:bg-emerald-500 data-[state=active]:text-white text-xs">
              <Settings className="w-3.5 h-3.5 mr-1.5" />
              Consolidation Rules
            </TabsTrigger>
            <TabsTrigger value="currency" className="rounded-lg data-[state=active]:bg-teal-500 data-[state=active]:text-white text-xs">
              <DollarSign className="w-3.5 h-3.5 mr-1.5" />
              Currency Settings
            </TabsTrigger>
            <TabsTrigger value="validation" className="rounded-lg data-[state=active]:bg-cyan-500 data-[state=active]:text-white text-xs">
              <Shield className="w-3.5 h-3.5 mr-1.5" />
              Validation Rules
            </TabsTrigger>
            <TabsTrigger value="system" className="rounded-lg data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-xs">
              <Info className="w-3.5 h-3.5 mr-1.5" />
              System Info
            </TabsTrigger>
          </TabsList>

          {/* Consolidation Rules Tab */}
          <TabsContent value="consolidation" className="space-y-4">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Settings className="w-5 h-5 text-emerald-500" />
                      Consolidation Parameters
                    </CardTitle>
                    <CardDescription>Configure how consolidation calculations are performed</CardDescription>
                  </div>
                  <Button 
                    onClick={handleSaveConsolidation}
                    disabled={saving === 'consolidation'}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {saving === 'consolidation' ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save Changes
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      Rounding Tolerance
                      <Badge variant="outline" className="text-[9px]">0.01 – 1.00</Badge>
                    </Label>
                    <Input
                      type="number"
                      min={0.01}
                      max={1.00}
                      step={0.01}
                      value={consolidationForm.roundingTolerance}
                      onChange={(e) => setConsolidationForm({
                        ...consolidationForm,
                        roundingTolerance: parseFloat(e.target.value) || 0.01,
                      })}
                      className="font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">Maximum allowed rounding difference in consolidated totals</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">IC Elimination Threshold (€)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={10}
                      value={consolidationForm.eliminationThreshold}
                      onChange={(e) => setConsolidationForm({
                        ...consolidationForm,
                        eliminationThreshold: parseFloat(e.target.value) || 0,
                      })}
                      className="font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">Minimum amount for IC transaction elimination matching</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Minority Interest Method</Label>
                    <Select
                      value={consolidationForm.minorityInterestMethod}
                      onValueChange={(val) => setConsolidationForm({
                        ...consolidationForm,
                        minorityInterestMethod: val,
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="proportional">Proportional</SelectItem>
                        <SelectItem value="full">Full</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">How minority interest is calculated in equity</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Balance Sheet Check Tolerance</Label>
                    <Input
                      type="number"
                      min={0}
                      max={1}
                      step={0.01}
                      value={consolidationForm.balanceSheetTolerance}
                      onChange={(e) => setConsolidationForm({
                        ...consolidationForm,
                        balanceSheetTolerance: parseFloat(e.target.value) || 0,
                      })}
                      className="font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">Acceptable deviation for A = L + E balance check</p>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between p-4 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200/30 dark:border-emerald-800/20">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10">
                      <Zap className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Auto-Consolidation</p>
                      <p className="text-[10px] text-muted-foreground">Automatically run consolidation when all entity data is submitted</p>
                    </div>
                  </div>
                  <Switch
                    checked={consolidationForm.autoConsolidation}
                    onCheckedChange={(checked) => setConsolidationForm({
                      ...consolidationForm,
                      autoConsolidation: checked,
                    })}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Currency Settings Tab */}
          <TabsContent value="currency" className="space-y-4">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Globe className="w-5 h-5 text-teal-500" />
                      Currency Configuration
                    </CardTitle>
                    <CardDescription>Manage base currency, rate preferences, and exchange rate sources</CardDescription>
                  </div>
                  <Button 
                    onClick={handleSaveCurrency}
                    disabled={saving === 'currency'}
                    className="bg-teal-600 hover:bg-teal-700 text-white"
                  >
                    {saving === 'currency' ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save Changes
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Base Currency</Label>
                    <Select
                      value={currencyForm.baseCurrency}
                      onValueChange={(val) => setCurrencyForm({ ...currencyForm, baseCurrency: val })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EUR">EUR — Euro</SelectItem>
                        <SelectItem value="GBP">GBP — British Pound</SelectItem>
                        <SelectItem value="USD">USD — US Dollar</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">Group reporting currency</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Rate Type Preference</Label>
                    <Select
                      value={currencyForm.rateTypePreference}
                      onValueChange={(val) => setCurrencyForm({ ...currencyForm, rateTypePreference: val })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="closing">Closing Rate</SelectItem>
                        <SelectItem value="average">Average Rate</SelectItem>
                        <SelectItem value="historical">Historical Rate</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">Default rate type for currency conversion</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Exchange Rate Provider</Label>
                    <Select
                      value={currencyForm.exchangeRateProvider}
                      onValueChange={(val) => setCurrencyForm({ ...currencyForm, exchangeRateProvider: val })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ECB">ECB — European Central Bank</SelectItem>
                        <SelectItem value="Manual">Manual Entry</SelectItem>
                        <SelectItem value="Bloomberg">Bloomberg Feed</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">Primary source for exchange rates</p>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">ECB API Key</Label>
                    <Input
                      type="password"
                      placeholder="Enter ECB API key"
                      disabled={!currencyForm.ecbApiEnabled}
                      className="font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">Required for automatic rate fetching from ECB</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Refresh Frequency (hours)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={168}
                      value={currencyForm.refreshFrequencyHours}
                      onChange={(e) => setCurrencyForm({
                        ...currencyForm,
                        refreshFrequencyHours: parseInt(e.target.value) || 24,
                      })}
                      className="font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">How often to refresh rates from provider</p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-teal-50/50 dark:bg-teal-950/20 rounded-xl border border-teal-200/30 dark:border-teal-800/20">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-teal-500/10">
                      <Activity className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">ECB API Integration</p>
                      <p className="text-[10px] text-muted-foreground">Enable automatic exchange rate fetching from European Central Bank</p>
                    </div>
                  </div>
                  <Switch
                    checked={currencyForm.ecbApiEnabled}
                    onCheckedChange={(checked) => setCurrencyForm({ ...currencyForm, ecbApiEnabled: checked })}
                  />
                </div>

                <Separator />

                {/* Currency Pairs Table */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold">Currency Pairs</h3>
                    <Dialog open={newPairDialog} onOpenChange={setNewPairDialog}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" className="text-xs border-teal-200 dark:border-teal-800 hover:bg-teal-50 dark:hover:bg-teal-950/30">
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Add Pair
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Currency Pair</DialogTitle>
                          <DialogDescription>Configure a new currency pair for exchange rate tracking</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>From Currency</Label>
                              <Select value={newPairFrom} onValueChange={setNewPairFrom}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="GBP">GBP</SelectItem>
                                  <SelectItem value="USD">USD</SelectItem>
                                  <SelectItem value="CHF">CHF</SelectItem>
                                  <SelectItem value="JPY">JPY</SelectItem>
                                  <SelectItem value="SEK">SEK</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>To Currency</Label>
                              <Select value={newPairTo} onValueChange={setNewPairTo}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="EUR">EUR</SelectItem>
                                  <SelectItem value="GBP">GBP</SelectItem>
                                  <SelectItem value="USD">USD</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Rate Type</Label>
                            <Select value={newPairRateType} onValueChange={setNewPairRateType}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Closing">Closing</SelectItem>
                                <SelectItem value="Average">Average</SelectItem>
                                <SelectItem value="Historical">Historical</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setNewPairDialog(false)}>Cancel</Button>
                          <Button onClick={handleAddCurrencyPair} className="bg-teal-600 hover:bg-teal-700 text-white">Add Pair</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>

                  <div className="rounded-xl border overflow-hidden">
                    <Table className="premium-table">
                      <TableHeader>
                        <TableRow className="cursor-pointer transition-colors duration-150 bg-slate-50/80 dark:bg-slate-800/50">
                          <TableHead className="text-xs">From</TableHead>
                          <TableHead className="text-xs"></TableHead>
                          <TableHead className="text-xs">To</TableHead>
                          <TableHead className="text-xs">Rate Type</TableHead>
                          <TableHead className="text-xs">Last Updated</TableHead>
                          <TableHead className="text-xs">Source</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {currencyPairs.map((pair, idx) => (
                          <TableRow key={pair.id} className={`cursor-pointer transition-colors duration-150 ${idx % 2 === 1 ? 'bg-slate-50/30 dark:bg-slate-800/20' : ''}`}>
                            <TableCell className="font-mono text-sm font-medium">{pair.fromCurrency}</TableCell>
                            <TableCell className="w-8"><ArrowRight className="w-3.5 h-3.5 text-muted-foreground" /></TableCell>
                            <TableCell className="font-mono text-sm font-medium">{pair.toCurrency}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px]">{pair.rateType}</Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{pair.lastUpdated}</TableCell>
                            <TableCell>
                              <Badge className={`text-[9px] ${pair.source === 'ECB' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : pair.source === 'Bloomberg' ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'}`}>
                                {pair.source}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Validation Rules Tab */}
          <TabsContent value="validation" className="space-y-4">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Shield className="w-5 h-5 text-cyan-500" />
                      Validation Rules
                    </CardTitle>
                    <CardDescription>
                      Configure data validation rules — {activeRules} of {validationRulesForm.length} rules active
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="text-xs" onClick={handleImportRules}>
                      <FileUp className="w-3.5 h-3.5 mr-1" />
                      Import
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs" onClick={handleExportRules}>
                      <FileDown className="w-3.5 h-3.5 mr-1" />
                      Export
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="text-xs border-cyan-200 dark:border-cyan-800 hover:bg-cyan-50 dark:hover:bg-cyan-950/30"
                      onClick={() => handleBulkToggle(true)}
                    >
                      Enable All
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="text-xs border-slate-200 dark:border-slate-800"
                      onClick={() => handleBulkToggle(false)}
                    >
                      Disable All
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border overflow-hidden">
                  <Table className="premium-table">
                    <TableHeader>
                      <TableRow className="cursor-pointer transition-colors duration-150 bg-slate-50/80 dark:bg-slate-800/50">
                        <TableHead className="text-xs w-8">#</TableHead>
                        <TableHead className="text-xs">Rule Name</TableHead>
                        <TableHead className="text-xs">Entity Scope</TableHead>
                        <TableHead className="text-xs">Severity</TableHead>
                        <TableHead className="text-xs">Description</TableHead>
                        <TableHead className="text-xs text-center">Active</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validationRulesForm.map((rule, idx) => (
                        <TableRow key={rule.id} className={`cursor-pointer transition-colors duration-150 ${idx % 2 === 1 ? 'bg-slate-50/30 dark:bg-slate-800/20' : ''} ${!rule.isActive ? 'opacity-60' : ''}`}>
                          <TableCell className="font-mono text-[10px] text-muted-foreground">{rule.id}</TableCell>
                          <TableCell className="font-medium text-sm">{rule.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[9px]">
                              {rule.entityScope === 'all' ? 'All Entities' : rule.entityScope === 'non-eur' ? 'Non-EUR' : rule.entityScope}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-[9px] ${rule.severity === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                              {rule.severity === 'error' ? (
                                <span className="flex items-center gap-1"><XCircle className="w-3 h-3" /> Error</span>
                              ) : (
                                <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Warning</span>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[250px] truncate">{rule.description}</TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={rule.isActive}
                              onCheckedChange={() => handleToggleRule(rule.id)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Add Rule Button */}
                <div className="mt-4">
                  <Dialog open={newRuleDialog} onOpenChange={setNewRuleDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full border-dashed border-cyan-300 dark:border-cyan-800 hover:bg-cyan-50/50 dark:hover:bg-cyan-950/20 text-cyan-600 dark:text-cyan-400">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Validation Rule
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Validation Rule</DialogTitle>
                        <DialogDescription>Create a new data validation rule for the consolidation process</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Rule Name</Label>
                          <Input
                            placeholder="e.g., Revenue consistency check"
                            value={newRuleName}
                            onChange={(e) => setNewRuleName(e.target.value)}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Entity Scope</Label>
                            <Select value={newRuleScope} onValueChange={setNewRuleScope}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Entities</SelectItem>
                                <SelectItem value="non-eur">Non-EUR Only</SelectItem>
                                <SelectItem value="eu">EU Entities</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Severity</Label>
                            <Select value={newRuleSeverity} onValueChange={(v) => setNewRuleSeverity(v as 'error' | 'warning')}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="error">Error — Block consolidation</SelectItem>
                                <SelectItem value="warning">Warning — Allow with alert</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Description</Label>
                          <Input
                            placeholder="Describe what this rule validates..."
                            value={newRuleDescription}
                            onChange={(e) => setNewRuleDescription(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setNewRuleDialog(false)}>Cancel</Button>
                        <Button onClick={handleAddRule} className="bg-cyan-600 hover:bg-cyan-700 text-white">Add Rule</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* System Info Tab */}
          <TabsContent value="system" className="space-y-4">
            {/* Version History */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="w-5 h-5 text-emerald-500" />
                  Version History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
                  {versionHistory.map((v, idx) => (
                    <motion.div
                      key={v.version}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className={`flex items-start gap-3 p-3 rounded-lg ${idx === 0 ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/30 dark:border-emerald-800/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'}`}
                    >
                      <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${idx === 0 ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-muted-foreground'}`}>
                        <span className="text-[10px] font-bold">{v.version.charAt(1)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{v.version}</p>
                          {idx === 0 && (
                            <Badge className="text-[8px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Current</Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground ml-auto">{v.date}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{v.notes}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Database Statistics */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <HardDrive className="w-5 h-5 text-teal-500" />
                  Database Statistics
                </CardTitle>
                <CardDescription>SQLite database — {settings.system.dbSize} · {settings.system.recordCount.toLocaleString()} total records</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {tableCounts.map((tc) => (
                    <div key={tc.table} className="p-3 bg-slate-50/80 dark:bg-slate-800/30 rounded-lg text-center">
                      <p className="text-lg font-bold text-teal-600 dark:text-teal-400">{tc.count.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">{tc.table}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Last seed: 2024-12-15 · Last backup: {settings.system.lastBackup}</span>
                </div>
              </CardContent>
            </Card>

            {/* API Endpoint Status */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="w-5 h-5 text-cyan-500" />
                  API Endpoint Status
                </CardTitle>
                <CardDescription>{healthyEndpoints} of {apiEndpoints.length} endpoints healthy</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border overflow-hidden">
                  <Table className="premium-table">
                    <TableHeader>
                      <TableRow className="cursor-pointer transition-colors duration-150 bg-slate-50/80 dark:bg-slate-800/50">
                        <TableHead className="text-xs">Endpoint</TableHead>
                        <TableHead className="text-xs">Method</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">Avg Response</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {apiEndpoints.map((ep, idx) => (
                        <TableRow key={`${ep.path}-${ep.method}`} className={`cursor-pointer transition-colors duration-150 ${idx % 2 === 1 ? 'bg-slate-50/30 dark:bg-slate-800/20' : ''}`}>
                          <TableCell className="font-mono text-xs">{ep.path}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[9px] font-mono ${ep.method === 'GET' ? 'text-emerald-600 dark:text-emerald-400' : 'text-cyan-600 dark:text-cyan-400'}`}>
                              {ep.method}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span className="relative flex h-2 w-2">
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                              </span>
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 capitalize">{ep.status}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{ep.avgResponseTime}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Environment Info */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-emerald-500" />
                  Environment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {[
                    { label: 'Node Version', value: environmentInfo.nodeVersion, icon: Cpu, color: 'emerald' },
                    { label: 'Database', value: environmentInfo.dbType, icon: Database, color: 'teal' },
                    { label: 'Cache', value: environmentInfo.cacheStatus, icon: Zap, color: 'cyan' },
                    { label: 'Platform', value: environmentInfo.platform, icon: Server, color: 'emerald' },
                    { label: 'Runtime', value: environmentInfo.runtime, icon: Cpu, color: 'teal' },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.label} className="p-4 bg-slate-50/80 dark:bg-slate-800/30 rounded-xl text-center">
                        <Icon className={`w-5 h-5 mx-auto mb-2 ${item.color === 'emerald' ? 'text-emerald-500' : item.color === 'teal' ? 'text-teal-500' : 'text-cyan-500'}`} />
                        <p className="text-sm font-semibold">{item.value}</p>
                        <p className="text-[10px] text-muted-foreground">{item.label}</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Backup & Maintenance */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Database className="w-5 h-5 text-teal-500" />
                  Backup &amp; Maintenance
                </CardTitle>
                <CardDescription>Database management, backup, and system maintenance tools</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Button
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-center gap-2 border-dashed border-teal-200 dark:border-teal-800 hover:bg-teal-50/50 dark:hover:bg-teal-950/20"
                    onClick={handleExportDatabase}
                  >
                    <Download className="w-6 h-6 text-teal-500" />
                    <span className="text-sm font-medium">Export Database</span>
                    <span className="text-[10px] text-muted-foreground">Download SQLite backup file</span>
                  </Button>

                  <Button
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-center gap-2 border-dashed border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20"
                    onClick={() => toast.info('Import database: select a .db file to restore from')}
                  >
                    <Upload className="w-6 h-6 text-emerald-500" />
                    <span className="text-sm font-medium">Import Database</span>
                    <span className="text-[10px] text-muted-foreground">Restore from backup file</span>
                  </Button>

                  <Button
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-center gap-2 border-dashed border-cyan-200 dark:border-cyan-800 hover:bg-cyan-50/50 dark:hover:bg-cyan-950/20"
                    onClick={handleClearCache}
                  >
                    <RefreshCw className="w-6 h-6 text-cyan-500" />
                    <span className="text-sm font-medium">Clear Cache</span>
                    <span className="text-[10px] text-muted-foreground">Reset in-memory cache</span>
                  </Button>
                </div>

                <Separator />

                <div className="p-4 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-200/30 dark:border-amber-800/20">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Danger Zone</p>
                      <p className="text-xs text-muted-foreground mt-1">Reset all settings and demo data to their default values. This action cannot be undone.</p>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="mt-3 text-xs"
                        onClick={handleResetDemo}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                        Reset Demo Data
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
