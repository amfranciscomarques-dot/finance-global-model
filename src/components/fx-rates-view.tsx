'use client';

import { useState, useEffect, useCallback } from 'react';
import { DollarSign, Plus, RefreshCw, Loader2, TrendingUp, TrendingDown, AlertTriangle, Bell, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { getExchangeRates, createExchangeRate } from '@/lib/api';
import { ExchangeRateInfo } from '@/lib/types';
import { demoFxRates } from '@/lib/demo-data';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';

const currencyFlags: Record<string, string> = {
  EUR: '🇪🇺', GBP: '🇬🇧', USD: '🇺🇸', CHF: '🇨🇭', JPY: '🇯🇵',
  SEK: '🇸🇪', NOK: '🇳🇴', DKK: '🇩🇰', PLN: '🇵🇱', CZK: '🇨🇿',
};

const currencySymbols: Record<string, string> = {
  EUR: '€', GBP: '£', USD: '$', CHF: 'Fr', JPY: '¥',
  SEK: 'kr', NOK: 'kr', DKK: 'kr', PLN: 'zł', CZK: 'Kč',
};

const rateChanges: Record<string, { change: string; positive: boolean; dailyChange: string; bid: string; ask: string }> = {
  GBP: { change: '-1.9%', positive: false, dailyChange: '-0.12%', bid: '0.8559', ask: '0.8583' },
  USD: { change: '+2.0%', positive: true, dailyChange: '+0.08%', bid: '1.0812', ask: '1.0828' },
  CHF: { change: '-0.5%', positive: false, dailyChange: '-0.03%', bid: '0.9408', ask: '0.9422' },
};

// 12-month trend data for major currency pairs
const trendData: Record<string, number[]> = {
  GBP: [0.8740, 0.8720, 0.8690, 0.8650, 0.8620, 0.8600, 0.8590, 0.8585, 0.8580, 0.8575, 0.8573, 0.8571],
  USD: [1.1040, 1.0980, 1.0950, 1.0920, 1.0900, 1.0880, 1.0870, 1.0860, 1.0850, 1.0840, 1.0830, 1.0820],
  CHF: [0.9450, 0.9440, 0.9435, 0.9430, 0.9425, 0.9420, 0.9418, 0.9416, 0.9414, 0.9412, 0.9413, 0.9415],
};

// Rate alert thresholds
function isRateAlert(currency: string): boolean {
  const changes: Record<string, number> = { GBP: -1.9, USD: 2.0, CHF: -0.5 };
  return Math.abs(changes[currency] || 0) > 2;
}

function MiniLineChart({ data, color }: { data: number[]; color: string }) {
  const chartData = data.map((v, i) => ({ x: i, value: v }));
  return (
    <div className="w-24 h-10">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 1, right: 1, left: 1, bottom: 1 }}>
          <YAxis domain={['dataMin', 'dataMax']} hide />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FxRatesView() {
  const [activeTab, setActiveTab] = useState('closing');
  const [rates, setRates] = useState<ExchangeRateInfo[]>(demoFxRates);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [newRate, setNewRate] = useState<Partial<ExchangeRateInfo>>({
    currency: '', rateType: 'closing', rate: 0, source: 'Manual', rateDate: '2024-12-31',
  });
  const { toast } = useToast();

  const loadRates = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getExchangeRates(undefined, activeTab);
      if (data && data.length > 0) {
        setRates(data);
      }
    } catch (err) {
      console.log('Using fallback FX rates');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadRates();
  }, [loadRates]);

  const handleAddRate = async () => {
    if (!newRate.currency || !newRate.rate) return;
    setSaving(true);
    try {
      const created = await createExchangeRate(newRate);
      setRates([...rates, created]);
      setDialogOpen(false);
      setNewRate({ currency: '', rateType: 'closing', rate: 0, source: 'Manual', rateDate: '2024-12-31' });
      toast({ title: 'Rate Added', description: `${newRate.currency} rate added successfully` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Get summary rates for the cards
  const gbpRate = rates.find(r => r.currency === 'GBP' && r.rateType === 'closing');
  const usdRate = rates.find(r => r.currency === 'USD' && r.rateType === 'closing');
  const chfRate = rates.find(r => r.currency === 'CHF' && r.rateType === 'closing');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            Exchange Rate Management
          </h2>
          <p className="text-sm text-muted-foreground">Rates are expressed as 1 EUR = X Foreign Currency</p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700 transition-colors">
                <Plus className="w-4 h-4 mr-1" /> Add Rate
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Exchange Rate</DialogTitle>
                <DialogDescription>Enter a new exchange rate to EUR</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select value={newRate.currency || ''} onValueChange={(v) => setNewRate({ ...newRate, currency: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {['EUR','GBP','USD','CHF','JPY','SEK','NOK','DKK','PLN','CZK'].map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Rate Type</Label>
                    <Select value={newRate.rateType || 'closing'} onValueChange={(v) => setNewRate({ ...newRate, rateType: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="closing">Closing</SelectItem>
                        <SelectItem value="average">Average</SelectItem>
                        <SelectItem value="historical">Historical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Rate (1 EUR = X Currency)</Label>
                  <Input type="number" step="0.0001" placeholder="e.g. 0.8571" value={newRate.rate || ''}
                    onChange={(e) => setNewRate({ ...newRate, rate: parseFloat(e.target.value) })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Rate Date</Label>
                    <Input type="date" value={newRate.rateDate || '2024-12-31'}
                      onChange={(e) => setNewRate({ ...newRate, rateDate: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Source</Label>
                    <Select value={newRate.source || 'Manual'} onValueChange={(v) => setNewRate({ ...newRate, source: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ECB">ECB</SelectItem>
                        <SelectItem value="Manual">Manual</SelectItem>
                        <SelectItem value="Bloomberg">Bloomberg</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-all" onClick={handleAddRate} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Add Rate
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="outline" className="gap-1" onClick={() => setAlertDialogOpen(true)}>
            <Bell className="w-4 h-4" /> Rate Alert
          </Button>
          <Button variant="outline" onClick={loadRates} className="transition-all active:scale-95">
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
          <CardContent className="p-0">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="px-6 pt-6">
                <TabsList>
                  <TabsTrigger value="closing">Closing Rates</TabsTrigger>
                  <TabsTrigger value="average">Average Rates</TabsTrigger>
                  <TabsTrigger value="historical">Historical Rates</TabsTrigger>
                </TabsList>
              </div>

              {['closing', 'average', 'historical'].map((tab) => (
                <TabsContent key={tab} value={tab} className="mt-0">
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-sm text-muted-foreground">Loading rates...</span>
                    </div>
                  ) : (
                    <div className="max-h-[500px] overflow-y-auto">
                      <Table className="premium-table">
                        <TableHeader>
                          <TableRow className="cursor-pointer transition-colors duration-150 sticky top-0 bg-white dark:bg-slate-900 z-10 border-b-2 border-slate-200 dark:border-slate-700">
                            <TableHead>Currency</TableHead>
                            <TableHead>Rate Date</TableHead>
                            <TableHead className="text-right">Rate (1 EUR =)</TableHead>
                            <TableHead>Source</TableHead>
                            <TableHead className="text-right">Inverse Rate</TableHead>
                            <TableHead className="hidden sm:table-cell text-center">12M Trend</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rates.filter((r) => r.rateType === tab).map((rate, index) => {
                            const trend = trendData[rate.currency];
                            const hasAlert = isRateAlert(rate.currency);
                            return (
                              <TableRow key={rate.id} className={`cursor-pointer transition-colors duration-150 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 ${index % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}`}>
                                <TableCell>
                                  <span className="flex items-center gap-2">
                                    <span className="text-lg">{currencyFlags[rate.currency] || '💱'}</span>
                                    <span className="font-medium">{rate.currency}</span>
                                    <span className="text-[10px] text-muted-foreground font-mono">({currencySymbols[rate.currency] || rate.currency})</span>
                                    {hasAlert && (
                                      <span title="Rate moved >2% from average">
                                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                      </span>
                                    )}
                                  </span>
                                </TableCell>
                                <TableCell className="text-muted-foreground">{typeof rate.rateDate === 'string' && rate.rateDate.includes('T') ? rate.rateDate.split('T')[0] : rate.rateDate}</TableCell>
                                <TableCell className="text-right font-mono font-semibold">{rate.rate.toFixed(4)}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={rate.source === 'ECB' ? 'border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400' : rate.source === 'Manual' ? 'border-amber-200 text-amber-700 dark:border-amber-800 dark:text-amber-400' : 'border-slate-200'}>
                                    {rate.source}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right font-mono text-muted-foreground">
                                  {rate.rate !== 0 ? (1 / rate.rate).toFixed(4) : '—'}
                                </TableCell>
                                <TableCell className="hidden sm:table-cell">
                                  <div className="flex justify-center">
                                    {trend ? (
                                      <MiniLineChart data={trend} color={rateChanges[rate.currency]?.positive ? '#10b981' : '#f59e0b'} />
                                    ) : (
                                      <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>

      {/* Enhanced Rate Cards with more detail */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'EUR/GBP', rate: gbpRate?.rate.toFixed(4) || '0.8571', currency: 'GBP' },
          { label: 'EUR/USD', rate: usdRate?.rate.toFixed(4) || '1.0820', currency: 'USD' },
          { label: 'EUR/CHF', rate: chfRate?.rate.toFixed(4) || '0.9415', currency: 'CHF' },
        ].map((item, index) => {
          const changeInfo = rateChanges[item.currency];
          const hasAlert = isRateAlert(item.currency);
          const trend = trendData[item.currency];
          return (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + index * 0.1 }}
            >
              <Card className={`shadow-sm border border-slate-200/60 dark:border-slate-700/40 bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-950/30 dark:to-slate-900 hover:scale-[1.02] transition-all duration-200 hover:shadow-emerald-500/10 hover:shadow-lg ${hasAlert ? 'ring-1 ring-amber-300 dark:ring-amber-700' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{item.label}</p>
                    <span className="text-lg">{currencyFlags[item.currency]}</span>
                  </div>
                  <p className="text-2xl font-bold font-mono">{item.rate}</p>
                  <div className="flex items-center justify-between mt-2">
                    <p className={`text-xs flex items-center gap-0.5 ${changeInfo?.positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {changeInfo?.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {changeInfo?.change} vs opening
                    </p>
                    {hasAlert && (
                      <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800 text-[9px] flex items-center gap-0.5">
                        <AlertTriangle className="w-2.5 h-2.5" /> Alert
                      </Badge>
                    )}
                  </div>
                  {/* Bid/Ask spread */}
                  {changeInfo && (
                    <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase">Bid</p>
                        <p className="text-xs font-mono font-medium">{changeInfo.bid}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase">Ask</p>
                        <p className="text-xs font-mono font-medium">{changeInfo.ask}</p>
                      </div>
                    </div>
                  )}
                  {/* Mini trend chart */}
                  {trend && (
                    <div className="mt-2">
                      <MiniLineChart data={trend} color={changeInfo?.positive ? '#10b981' : '#f59e0b'} />
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Rate Alert Setup Dialog */}
      <Dialog open={alertDialogOpen} onOpenChange={setAlertDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-amber-500" />
              Rate Alert Setup
            </DialogTitle>
            <DialogDescription>Get notified when exchange rates exceed your thresholds</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Currency Pair</Label>
              <Select defaultValue="GBP">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="GBP">EUR/GBP</SelectItem>
                  <SelectItem value="USD">EUR/USD</SelectItem>
                  <SelectItem value="CHF">EUR/CHF</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Threshold (%)</Label>
                <Input type="number" step="0.1" defaultValue="2.0" />
              </div>
              <div className="space-y-2">
                <Label>Direction</Label>
                <Select defaultValue="both">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Both ↑↓</SelectItem>
                    <SelectItem value="up">Increase only ↑</SelectItem>
                    <SelectItem value="down">Decrease only ↓</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notification Method</Label>
              <Select defaultValue="email">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="inapp">In-App</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlertDialogOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-all" onClick={() => { setAlertDialogOpen(false); toast({ title: 'Alert Created', description: 'Rate alert has been set up' }); }}>
              Create Alert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
