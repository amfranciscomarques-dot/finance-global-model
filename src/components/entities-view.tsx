'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Search, Globe, Building2, Loader2, Download, GitCompare, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts';
import { getEntities, createEntity } from '@/lib/api';
import { Entity } from '@/lib/types';
import { incomeStatements, balanceSheets, demoEntities } from '@/lib/demo-data';
import { formatNumber } from '@/lib/format';
import { DataLoadError } from '@/components/data-load-error';
import {
  PIE_COLORS,
  countryFlags,
  countryNames,
  sparklineData,
  geoData,
  normalizeOwnership,
  toEntityCSV,
  buildComparisonMetrics,
  formatMetricValue,
  computeMetricDelta,
  countMetricLeads,
  buildEntityBarChartData,
  buildOwnershipWaterfall,
  buildOwnershipData,
  buildFinancialRatios,
} from '@/components/entities/helpers';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';

function getMethodBadge(method: string) {
  switch (method) {
    case 'full':
      return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">Full</Badge>;
    case 'proportional':
      return <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">Proportional</Badge>;
    case 'equity':
      return <Badge className="bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-800/30 dark:text-slate-400 dark:border-slate-700">Equity</Badge>;
    default:
      return <Badge variant="outline">{method}</Badge>;
  }
}

// Mini sparkline component
function MiniSparkline({ data, color = '#10b981' }: { data: number[]; color?: string }) {
  const chartData = data.map((v, i) => ({ x: i, value: v }));
  return (
    <div className="w-20 h-8">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 1, right: 1, left: 1, bottom: 1 }}>
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function exportToCSV(entities: Entity[], filename: string) {
  const blob = new Blob([toEntityCSV(entities)], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function ComparisonTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload) return null;
  return (
    <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-xl border border-slate-700 text-xs">
      <p className="font-medium mb-1 text-slate-300">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-400">{entry.name}:</span>
          <span className="font-semibold">€{(entry.value / 1000).toFixed(1)}M</span>
        </p>
      ))}
    </div>
  );
}

export function EntitiesView() {
  const [search, setSearch] = useState('');
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [newEntity, setNewEntity] = useState<Partial<Entity>>({
    code: '', legalName: '', countryCode: '', localCurrency: 'EUR',
    consolidationMethod: 'full', ownershipPercentage: 100, sector: 'Technology', isActive: true,
  });
  const { toast } = useToast();

  // Entity Comparison state
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [compareEntityA, setCompareEntityA] = useState<string>('');
  const [compareEntityB, setCompareEntityB] = useState<string>('');
  const [showComparison, setShowComparison] = useState(false);

  const loadEntities = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await getEntities(search || undefined);
      setEntities(data);
    } catch (err) {
      console.error('Failed to load entities:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadEntities();
  }, [loadEntities]);

  // Set default comparison entities when entities load
  useEffect(() => {
    if (entities.length >= 2 && !compareEntityA) {
      setCompareEntityA(entities[0].code);
      setCompareEntityB(entities[1].code);
    }
  }, [entities, compareEntityA]);

  const handleAddEntity = async () => {
    if (!newEntity.code || !newEntity.legalName || !newEntity.countryCode) return;
    setSaving(true);
    try {
      const created = await createEntity(newEntity);
      setEntities([...entities, created]);
      setDialogOpen(false);
      setNewEntity({
        code: '', legalName: '', countryCode: '', localCurrency: 'EUR',
        consolidationMethod: 'full', ownershipPercentage: 100, sector: 'Technology', isActive: true,
      });
      toast({ title: 'Entity Created', description: `${created.code} - ${created.legalName}` });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to create entity', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleRowClick = (entity: Entity) => {
    setSelectedEntity(entity);
    setSheetOpen(true);
  };

  const filteredEntities = entities.filter((e) => {
    const q = search.toLowerCase();
    return (
      e.code.toLowerCase().includes(q) ||
      e.legalName.toLowerCase().includes(q) ||
      e.countryCode.toLowerCase().includes(q) ||
      e.localCurrency.toLowerCase().includes(q)
    );
  });

  // Get financial data for selected entity
  const entityIS = selectedEntity ? incomeStatements[selectedEntity.code] : null;
  const entityBS = selectedEntity ? balanceSheets[selectedEntity.code] : null;

  const ownershipData = selectedEntity ? buildOwnershipData(selectedEntity) : [];

  // Financial ratios for selected entity
  const financialRatios = entityIS && entityBS ? buildFinancialRatios(entityIS, entityBS) : [];

  // ============================================================
  // COMPARISON COMPUTED DATA
  // ============================================================
  const entityA = entities.find(e => e.code === compareEntityA) || demoEntities.find(e => e.code === compareEntityA);
  const entityB = entities.find(e => e.code === compareEntityB) || demoEntities.find(e => e.code === compareEntityB);
  const isA = entityA ? incomeStatements[entityA.code] : null;
  const bsA = entityA ? balanceSheets[entityA.code] : null;
  const isB = entityB ? incomeStatements[entityB.code] : null;
  const bsB = entityB ? balanceSheets[entityB.code] : null;

  const comparisonMetrics = useMemo(() => {
    if (!isA || !bsA || !isB || !bsB) return [];
    return buildComparisonMetrics(isA, bsA, isB, bsB);
  }, [isA, bsA, isB, bsB]);

  // Grouped metrics for display
  const incomeMetrics = comparisonMetrics.filter(m => ['Revenue', 'COGS', 'Gross Profit', 'EBITDA', 'EBIT', 'Net Income'].includes(m.label));
  const balanceMetrics = comparisonMetrics.filter(m => ['Total Assets', 'Current Assets', 'Total Liabilities', 'Total Equity'].includes(m.label));
  const ratioMetrics = comparisonMetrics.filter(m => ['ROE', 'ROA', 'EBITDA Margin', 'Current Ratio', 'Debt/Equity'].includes(m.label));
  const metricLeads = useMemo(() => countMetricLeads(comparisonMetrics), [comparisonMetrics]);

  // Bar chart data for visual comparison
  const barChartData = useMemo(() => (
    isA && bsA && isB && bsB && entityA && entityB ? buildEntityBarChartData(isA, bsA, isB, bsB, entityA, entityB) : []
  ), [isA, bsA, isB, bsB, entityA, entityB]);

  // Ownership/Minority impact waterfall data
  const ownershipWaterfallA = useMemo(() => (isA && entityA ? buildOwnershipWaterfall(isA, entityA) : []), [isA, entityA]);
  const ownershipWaterfallB = useMemo(() => (isB && entityB ? buildOwnershipWaterfall(isB, entityB) : []), [isB, entityB]);

  const canCompare = entityA && entityB && isA && bsA && isB && bsB && entityA.code !== entityB.code;

  return (
    <div className="space-y-6">
      {loadError && <DataLoadError message="Could not load entities from the server. Try refreshing." />}
      {/* Geographic Map Section */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="flex items-center gap-2 mb-3">
          <Globe className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-semibold">Geographic Distribution</h3>
          <div className="flex-1 h-px bg-gradient-to-r from-emerald-200 to-transparent dark:from-emerald-800 dark:to-transparent" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {geoData.map((geo, index) => (
            <motion.div
              key={geo.code}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.08, duration: 0.3 }}
            >
              <Card className="shadow-sm hover:shadow-md hover:shadow-emerald-500/5 transition-all duration-200 cursor-pointer hover:scale-[1.02] bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-900/80">
                <CardContent className="p-3 text-center">
                  <span className="text-3xl">{geo.flag}</span>
                  <p className="text-sm font-semibold mt-1">{geo.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{geo.entity}</p>
                  <Separator className="my-2" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{geo.revenue}</p>
                    <div className="flex items-center justify-center gap-1">
                      <Badge variant="outline" className="text-[9px]">{geo.method}</Badge>
                      <span className="text-[10px] text-muted-foreground">{geo.ownership}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Gradient Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-emerald-300 dark:via-emerald-700 to-transparent" />

      <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-600" />
                Group Entities
              </CardTitle>
              <CardDescription>Manage subsidiaries and their consolidation parameters</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportToCSV(filteredEntities, 'entities-export.csv')}
              >
                <Download className="w-4 h-4 mr-1" />
                Export
              </Button>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-emerald-600 hover:bg-emerald-700">
                    <Plus className="w-4 h-4 mr-1" />
                    Add Entity
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add New Entity</DialogTitle>
                    <DialogDescription>Register a new subsidiary in the consolidation group</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="code">Entity Code</Label>
                        <Input id="code" placeholder="e.g. IT0006" value={newEntity.code || ''}
                          onChange={(e) => setNewEntity({ ...newEntity, code: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="country">Country</Label>
                        <Select value={newEntity.countryCode || ''} onValueChange={(v) => setNewEntity({ ...newEntity, countryCode: v })}>
                          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PT">Portugal</SelectItem><SelectItem value="ES">Spain</SelectItem>
                            <SelectItem value="DE">Germany</SelectItem><SelectItem value="GB">United Kingdom</SelectItem>
                            <SelectItem value="FR">France</SelectItem><SelectItem value="IT">Italy</SelectItem>
                            <SelectItem value="NL">Netherlands</SelectItem><SelectItem value="US">United States</SelectItem>
                            <SelectItem value="CH">Switzerland</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="legalName">Legal Name</Label>
                      <Input id="legalName" placeholder="e.g. TechNova Italia S.r.l." value={newEntity.legalName || ''}
                        onChange={(e) => setNewEntity({ ...newEntity, legalName: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="currency">Local Currency</Label>
                        <Select value={newEntity.localCurrency || 'EUR'} onValueChange={(v) => setNewEntity({ ...newEntity, localCurrency: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="EUR">EUR</SelectItem><SelectItem value="GBP">GBP</SelectItem>
                            <SelectItem value="USD">USD</SelectItem><SelectItem value="CHF">CHF</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="method">Consolidation Method</Label>
                        <Select value={newEntity.consolidationMethod || 'full'} onValueChange={(v) => setNewEntity({ ...newEntity, consolidationMethod: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="full">Full Consolidation</SelectItem>
                            <SelectItem value="proportional">Proportional</SelectItem>
                            <SelectItem value="equity">Equity Method</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="ownership">Ownership %</Label>
                        <Input id="ownership" type="number" min={0} max={100} value={newEntity.ownershipPercentage || 100}
                          onChange={(e) => setNewEntity({ ...newEntity, ownershipPercentage: parseFloat(e.target.value) })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sector">Sector</Label>
                        <Select value={newEntity.sector || 'Technology'} onValueChange={(v) => setNewEntity({ ...newEntity, sector: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Technology">Technology</SelectItem><SelectItem value="Consulting">Consulting</SelectItem>
                            <SelectItem value="Services">Services</SelectItem><SelectItem value="Manufacturing">Manufacturing</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleAddEntity} disabled={saving}>
                      {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                      Add Entity
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search entities by code, name, country, currency..." className="pl-10"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-3">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-4 w-12" />
                </div>
              ))}
            </div>
          ) : (
            <div className="max-h-[520px] overflow-y-auto">
              <Table className="premium-table">
                <TableHeader>
                  <TableRow className="cursor-pointer transition-colors duration-150 sticky top-0 bg-white dark:bg-slate-900 z-10 border-b-2 border-slate-200 dark:border-slate-700">
                    <TableHead>Code</TableHead><TableHead>Legal Name</TableHead>
                    <TableHead>Country</TableHead><TableHead>Currency</TableHead>
                    <TableHead>Method</TableHead><TableHead className="text-right">Ownership %</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead className="hidden sm:table-cell">Revenue Trend</TableHead>
                    <TableHead>Sector</TableHead><TableHead>Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Last Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntities.map((entity, index) => (
                    <TableRow
                      key={entity.id}
                      className={`cursor-pointer transition-colors ${
                        index % 2 === 0
                          ? 'hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10'
                          : 'bg-slate-50/50 dark:bg-slate-800/20 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10'
                      }`}
                      onClick={() => handleRowClick(entity)}
                    >
                      <TableCell className="font-mono font-semibold text-sm">{entity.code}</TableCell>
                      <TableCell className="font-medium">{entity.legalName}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          <span className="text-base">{countryFlags[entity.countryCode] || '🌍'}</span>
                          <span className="text-xs text-muted-foreground">{entity.countryCode}</span>
                        </span>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="font-mono text-xs">{entity.localCurrency}</Badge></TableCell>
                      <TableCell>{getMethodBadge(entity.consolidationMethod)}</TableCell>
                      <TableCell className="text-right font-medium">{Math.round(normalizeOwnership(entity.ownershipPercentage))}%</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1">
                          <span className={`w-2.5 h-2.5 rounded-full ${
                            entity.code === 'FR0005' ? 'bg-amber-500' :
                            entity.code === 'DE0003' ? 'bg-amber-400' :
                            'bg-emerald-500'
                          }`} style={{ boxShadow: entity.code === 'FR0005' ? '0 0 6px rgba(245,158,11,0.5)' : '0 0 6px rgba(16,185,129,0.5)' }} />
                          <span className="text-[10px] text-muted-foreground">
                            {entity.code === 'FR0005' ? 'Amber' : entity.code === 'DE0003' ? 'Fair' : 'Strong'}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {sparklineData[entity.code] ? (
                          <MiniSparkline data={sparklineData[entity.code]} />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell><span className="text-sm text-muted-foreground">{entity.sector || '—'}</span></TableCell>
                      <TableCell>
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 text-xs dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">
                          {entity.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-[10px] text-muted-foreground">Dec 31, 2024</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* ENTITY COMPARISON TOOL */}
      {/* ============================================================ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <Card className="shadow-sm overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <GitCompare className="w-4 h-4 text-teal-600" />
                  Entity Comparison
                </CardTitle>
                <CardDescription>Compare financial data between two entities side by side</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setComparisonOpen(!comparisonOpen)}
                className="gap-1"
              >
                <GitCompare className="w-3.5 h-3.5" />
                {comparisonOpen ? 'Hide' : 'Compare Entities'}
                {comparisonOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </CardHeader>

          <AnimatePresence>
            {comparisonOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: 'easeInOut' }}
                style={{ overflow: 'hidden' }}
              >
                <CardContent className="pt-2 space-y-6">
                  {/* Entity Selector Row */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3 p-4 bg-gradient-to-r from-emerald-50/50 to-teal-50/50 dark:from-emerald-950/20 dark:to-teal-950/20 rounded-xl border border-emerald-100 dark:border-emerald-900/50">
                    <div className="flex-1 w-full sm:w-auto">
                      <Label className="text-xs text-muted-foreground">Entity A</Label>
                      <Select value={compareEntityA} onValueChange={(v) => { setCompareEntityA(v); setShowComparison(false); }}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select entity" />
                        </SelectTrigger>
                        <SelectContent>
                          {entities.map(e => (
                            <SelectItem key={e.code} value={e.code} disabled={e.code === compareEntityB}>
                              {e.code} — {e.legalName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="hidden sm:flex items-center justify-center">
                      <GitCompare className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex-1 w-full sm:w-auto">
                      <Label className="text-xs text-muted-foreground">Entity B</Label>
                      <Select value={compareEntityB} onValueChange={(v) => { setCompareEntityB(v); setShowComparison(false); }}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select entity" />
                        </SelectTrigger>
                        <SelectContent>
                          {entities.map(e => (
                            <SelectItem key={e.code} value={e.code} disabled={e.code === compareEntityA}>
                              {e.code} — {e.legalName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700 whitespace-nowrap"
                      onClick={() => setShowComparison(true)}
                      disabled={!canCompare}
                    >
                      <GitCompare className="w-4 h-4 mr-1.5" />
                      Compare
                    </Button>
                  </div>

                  {/* Comparison Results */}
                  <AnimatePresence>
                    {showComparison && canCompare && (
                      <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.35 }}
                        className="space-y-6"
                      >
                        {/* Visual Bar Chart Comparison */}
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Financial Overview Comparison</h4>
                          <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
                            <CardContent className="p-4">
                              <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={barChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                    <defs>
                                      <linearGradient id="entityAGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.7} />
                                      </linearGradient>
                                      <linearGradient id="entityBGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={1} />
                                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.7} />
                                      </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} vertical={false} />
                                    <XAxis dataKey="metric" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}M`} stroke="var(--color-muted-foreground)" />
                                    <Tooltip content={<ComparisonTooltip />} />
                                    <Legend />
                                    <Bar dataKey={entityA!.code} fill="url(#entityAGradient)" radius={[4, 4, 0, 0]} name={entityA!.code} />
                                    <Bar dataKey={entityB!.code} fill="url(#entityBGradient)" radius={[4, 4, 0, 0]} name={entityB!.code} />
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                            </CardContent>
                          </Card>
                        </div>

                        {/* Income Statement Comparison */}
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Income Statement Comparison (€K)</h4>
                          <div className="overflow-x-auto">
                            <Table className="premium-table">
                              <TableHeader>
                                <TableRow className="cursor-pointer transition-colors duration-150 border-b-2 border-slate-200 dark:border-slate-700">
                                  <TableHead className="w-36">Metric</TableHead>
                                  <TableHead className="text-right">{entityA!.code}</TableHead>
                                  <TableHead className="text-right">{entityB!.code}</TableHead>
                                  <TableHead className="text-right">Variance</TableHead>
                                  <TableHead className="text-right">% Diff</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {incomeMetrics.map((metric, index) => {
                                  const { diff, pctDiff, isPositive } = computeMetricDelta(metric);
                                  return (
                                    <motion.tr
                                      key={metric.label}
                                      initial={{ opacity: 0, x: -10 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ delay: index * 0.05 }}
                                      className={index % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}
                                    >
                                      <TableCell className="font-medium text-sm">{metric.label}</TableCell>
                                      <TableCell className="text-right font-mono text-sm">{formatMetricValue(metric.entityA, metric.format)}</TableCell>
                                      <TableCell className="text-right font-mono text-sm">{formatMetricValue(metric.entityB, metric.format)}</TableCell>
                                      <TableCell className={`text-right font-mono text-sm font-semibold ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                        <span className="inline-flex items-center gap-1">
                                          {diff > 0 ? <TrendingUp className="w-3 h-3" /> : diff < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                                          {metric.format === 'currency' ? `€${(Math.abs(diff) / 1000).toFixed(1)}M` : formatMetricValue(Math.abs(diff), metric.format)}
                                        </span>
                                      </TableCell>
                                      <TableCell className={`text-right font-mono text-sm ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                        {pctDiff >= 0 ? '+' : ''}{pctDiff.toFixed(1)}%
                                      </TableCell>
                                    </motion.tr>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        </div>

                        {/* Balance Sheet Comparison */}
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Balance Sheet Comparison (€K)</h4>
                          <div className="overflow-x-auto">
                            <Table className="premium-table">
                              <TableHeader>
                                <TableRow className="cursor-pointer transition-colors duration-150 border-b-2 border-slate-200 dark:border-slate-700">
                                  <TableHead className="w-36">Metric</TableHead>
                                  <TableHead className="text-right">{entityA!.code}</TableHead>
                                  <TableHead className="text-right">{entityB!.code}</TableHead>
                                  <TableHead className="text-right">Variance</TableHead>
                                  <TableHead className="text-right">% Diff</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {balanceMetrics.map((metric, index) => {
                                  const { diff, pctDiff, isPositive } = computeMetricDelta(metric);
                                  return (
                                    <motion.tr
                                      key={metric.label}
                                      initial={{ opacity: 0, x: -10 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ delay: index * 0.05 }}
                                      className={index % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}
                                    >
                                      <TableCell className="font-medium text-sm">{metric.label}</TableCell>
                                      <TableCell className="text-right font-mono text-sm">{formatMetricValue(metric.entityA, metric.format)}</TableCell>
                                      <TableCell className="text-right font-mono text-sm">{formatMetricValue(metric.entityB, metric.format)}</TableCell>
                                      <TableCell className={`text-right font-mono text-sm font-semibold ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                        <span className="inline-flex items-center gap-1">
                                          {diff > 0 ? <TrendingUp className="w-3 h-3" /> : diff < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                                          {metric.format === 'currency' ? `€${(Math.abs(diff) / 1000).toFixed(1)}M` : formatMetricValue(Math.abs(diff), metric.format)}
                                        </span>
                                      </TableCell>
                                      <TableCell className={`text-right font-mono text-sm ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                        {pctDiff >= 0 ? '+' : ''}{pctDiff.toFixed(1)}%
                                      </TableCell>
                                    </motion.tr>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        </div>

                        {/* Key Ratios Comparison */}
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Key Ratios Comparison</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                            {ratioMetrics.map((metric, index) => {
                              const diff = metric.entityA - metric.entityB;
                              const isPositive = metric.higherIsBetter ? diff > 0 : diff < 0;
                              return (
                                <motion.div
                                  key={metric.label}
                                  initial={{ opacity: 0, scale: 0.9 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ delay: index * 0.06 }}
                                >
                                  <Card className="shadow-sm hover:shadow-lg hover:shadow-emerald-500/5 transition-shadow duration-300">
                                    <CardContent className="p-3">
                                      <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">{metric.label}</p>
                                      <div className="flex items-baseline gap-2 mb-1">
                                        <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{formatMetricValue(metric.entityA, metric.format)}</span>
                                        <span className="text-xs text-muted-foreground">vs</span>
                                        <span className="text-sm font-bold text-amber-700 dark:text-amber-400">{formatMetricValue(metric.entityB, metric.format)}</span>
                                      </div>
                                      <div className={`text-xs font-medium ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                        {isPositive ? '↑' : '↓'} {entityA!.code} {isPositive ? 'leads' : 'trails'}
                                      </div>
                                    </CardContent>
                                  </Card>
                                </motion.div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Variance Summary */}
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Variance Analysis Summary</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                              <Card className="bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-slate-900 border-emerald-100 dark:border-emerald-900/50">
                                <CardContent className="p-4">
                                  <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">{entityA!.code} Leads In</p>
                                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                    {metricLeads.a}
                                  </p>
                                  <p className="text-xs text-muted-foreground">out of {comparisonMetrics.length} metrics</p>
                                </CardContent>
                              </Card>
                            </motion.div>
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                              <Card className="bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/20 dark:to-slate-900 border-amber-100 dark:border-amber-900/50">
                                <CardContent className="p-4">
                                  <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">{entityB!.code} Leads In</p>
                                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                                    {metricLeads.b}
                                  </p>
                                  <p className="text-xs text-muted-foreground">out of {comparisonMetrics.length} metrics</p>
                                </CardContent>
                              </Card>
                            </motion.div>
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                              <Card className="bg-gradient-to-br from-teal-50 to-white dark:from-teal-950/20 dark:to-slate-900 border-teal-100 dark:border-teal-900/50">
                                <CardContent className="p-4">
                                  <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Revenue Gap</p>
                                  <p className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                                    {isA && isB ? `€${(Math.abs(isA.revenue - isB.revenue) / 1000).toFixed(1)}M` : '—'}
                                  </p>
                                  <p className="text-xs text-muted-foreground">absolute difference</p>
                                </CardContent>
                              </Card>
                            </motion.div>
                          </div>
                        </div>

                        {/* Ownership Impact / Minority Interest Waterfall */}
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Ownership Impact — Minority Interest Waterfall</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {entityA && ownershipWaterfallA.length > 0 && (
                              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                                <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
                                  <CardContent className="p-4">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                      {entityA.code} — Ownership: {Math.round(normalizeOwnership(entityA.ownershipPercentage))}%
                                    </p>
                                    <div className="space-y-2">
                                      {ownershipWaterfallA.map((item) => (
                                        <div key={item.name} className="flex items-center gap-3">
                                          <span className="text-xs text-muted-foreground w-28">{item.name}</span>
                                          <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-5 overflow-hidden relative">
                                            <motion.div
                                              className="h-full rounded-full"
                                              style={{ backgroundColor: item.fill }}
                                              initial={{ width: 0 }}
                                              animate={{ width: `${Math.max(2, (Math.abs(item.value) / ownershipWaterfallA[0].value) * 100)}%` }}
                                              transition={{ duration: 0.8, delay: 0.3 }}
                                            />
                                            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white mix-blend-difference">
                                              {item.value >= 0 ? '+' : ''}€{(item.value / 1000).toFixed(1)}M
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </CardContent>
                                </Card>
                              </motion.div>
                            )}
                            {entityB && ownershipWaterfallB.length > 0 && (
                              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                                <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
                                  <CardContent className="p-4">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                      {entityB.code} — Ownership: {Math.round(normalizeOwnership(entityB.ownershipPercentage))}%
                                    </p>
                                    <div className="space-y-2">
                                      {ownershipWaterfallB.map((item) => (
                                        <div key={item.name} className="flex items-center gap-3">
                                          <span className="text-xs text-muted-foreground w-28">{item.name}</span>
                                          <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-5 overflow-hidden relative">
                                            <motion.div
                                              className="h-full rounded-full"
                                              style={{ backgroundColor: item.fill }}
                                              initial={{ width: 0 }}
                                              animate={{ width: `${Math.max(2, (Math.abs(item.value) / ownershipWaterfallB[0].value) * 100)}%` }}
                                              transition={{ duration: 0.8, delay: 0.4 }}
                                            />
                                            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white mix-blend-difference">
                                              {item.value >= 0 ? '+' : ''}€{(item.value / 1000).toFixed(1)}M
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </CardContent>
                                </Card>
                              </motion.div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </motion.div>

      {/* Entity Detail Drawer */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          {selectedEntity && (
            <div className="space-y-4 pr-2">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-3">
                  <span className="text-3xl">{countryFlags[selectedEntity.countryCode] || '🌍'}</span>
                  <div>
                    <p className="text-lg font-bold">{selectedEntity.legalName}</p>
                    <p className="text-sm text-muted-foreground font-mono">{selectedEntity.code}</p>
                  </div>
                </SheetTitle>
                <SheetDescription>
                  {countryNames[selectedEntity.countryCode] || selectedEntity.countryCode} · {selectedEntity.localCurrency}
                </SheetDescription>
              </SheetHeader>

              {/* Tab Navigation */}
              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="w-full grid grid-cols-4 h-9">
                  <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                  <TabsTrigger value="financials" className="text-xs">Financials</TabsTrigger>
                  <TabsTrigger value="ratios" className="text-xs">Ratios</TabsTrigger>
                  <TabsTrigger value="history" className="text-xs">History</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-4 space-y-4">
                  {/* Key Financials */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Key Financials (€K)</h4>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3">
                        <p className="text-[10px] text-muted-foreground uppercase">Revenue</p>
                        <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                          {entityIS ? `€${(entityIS.revenue / 1000).toFixed(1)}M` : '—'}
                        </p>
                      </div>
                      <div className="bg-teal-50 dark:bg-teal-900/20 rounded-lg p-3">
                        <p className="text-[10px] text-muted-foreground uppercase">EBITDA</p>
                        <p className="text-lg font-bold text-teal-700 dark:text-teal-400">
                          {entityIS ? `€${(entityIS.ebitda / 1000).toFixed(1)}M` : '—'}
                        </p>
                      </div>
                      <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                        <p className="text-[10px] text-muted-foreground uppercase">Net Income</p>
                        <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
                          {entityIS ? `€${(entityIS.netIncome / 1000).toFixed(1)}M` : '—'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Ownership Structure Pie Chart */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Ownership Structure</h4>
                    <div className="flex items-center gap-4">
                      <div className="w-32 h-32">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={ownershipData}
                              cx="50%"
                              cy="50%"
                              innerRadius={30}
                              outerRadius={55}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {ownershipData.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} stroke="none" />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => [`${value.toFixed(0)}%`, '']} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-emerald-500" />
                          <span className="text-sm">Group: {Math.round(normalizeOwnership(selectedEntity.ownershipPercentage))}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-amber-500" />
                          <span className="text-sm">Minority: {100 - Math.round(normalizeOwnership(selectedEntity.ownershipPercentage))}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Currency & Consolidation Info */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Consolidation Details</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Local Currency</span>
                        <Badge variant="outline" className="font-mono">{selectedEntity.localCurrency}</Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Consolidation Method</span>
                        {getMethodBadge(selectedEntity.consolidationMethod)}
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Sector</span>
                        <span className="text-sm font-medium">{selectedEntity.sector || '—'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Status</span>
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">
                          {selectedEntity.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="financials" className="mt-4 space-y-4">
                  {entityIS ? (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Income Statement (€K)</h4>
                      <div className="space-y-2">
                        {[
                          { label: 'Revenue', value: entityIS.revenue, color: 'text-emerald-600 dark:text-emerald-400' },
                          { label: 'COGS', value: entityIS.cogs, color: '' },
                          { label: 'Gross Profit', value: entityIS.grossProfit, color: 'font-semibold' },
                          { label: 'EBITDA', value: entityIS.ebitda, color: 'text-teal-600 dark:text-teal-400 font-semibold' },
                          { label: 'EBIT', value: entityIS.ebit, color: '' },
                          { label: 'Net Income', value: entityIS.netIncome, color: 'text-emerald-600 dark:text-emerald-400 font-semibold' },
                        ].map((row) => (
                          <div key={row.label} className="flex justify-between text-sm py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                            <span className="text-muted-foreground">{row.label}</span>
                            <span className={`font-medium tabular-nums ${row.color}`}>{formatNumber(row.value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No financial data available</p>
                  )}
                  {entityBS && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Balance Sheet (€K)</h4>
                        <div className="space-y-2">
                          {[
                            { label: 'Total Assets', value: entityBS.totalAssets },
                            { label: 'Current Assets', value: entityBS.currentAssets },
                            { label: 'Total Equity', value: entityBS.totalEquity, color: 'text-emerald-600' },
                            { label: 'Total Liabilities', value: entityBS.totalLiabilities, color: 'text-amber-600' },
                          ].map((row) => (
                            <div key={row.label} className="flex justify-between text-sm py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                              <span className="text-muted-foreground">{row.label}</span>
                              <span className={`font-medium tabular-nums ${row.color || ''}`}>{formatNumber(row.value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="ratios" className="mt-4 space-y-4">
                  {financialRatios.length > 0 ? (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Key Financial Ratios</h4>
                      <div className="grid grid-cols-2 gap-3">
                        {financialRatios.map((ratio) => (
                          <div key={ratio.label} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-100 dark:border-slate-700/50">
                            <p className="text-[10px] text-muted-foreground uppercase">{ratio.label}</p>
                            <p className={`text-lg font-bold ${ratio.color}`}>{ratio.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No ratio data available</p>
                  )}
                </TabsContent>

                <TabsContent value="history" className="mt-4 space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Entity Timeline</h4>
                    <div className="space-y-3">
                      {[
                        { date: 'Dec 2024', event: 'Trial balance imported', icon: '📥' },
                        { date: 'Nov 2024', event: 'Consolidation run completed', icon: '✅' },
                        { date: 'Oct 2024', event: 'FX rate updated', icon: '💱' },
                        { date: 'Sep 2024', event: 'Budget entry saved', icon: '📊' },
                        { date: 'Aug 2024', event: 'COA mapping updated', icon: '📋' },
                      ].map((item, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <span className="text-sm">{item.icon}</span>
                          <div>
                            <p className="text-sm font-medium">{item.event}</p>
                            <p className="text-[10px] text-muted-foreground">{item.date}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
