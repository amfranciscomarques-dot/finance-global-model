'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search, Plus, Loader2, BookOpen, ArrowRightLeft, Filter,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { getCOA, getCOAMappings, createCOAAccount } from '@/lib/api';
import { COAAccount, COAMapping } from '@/lib/types';
import { DataLoadError } from '@/components/data-load-error';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';

// Demo fallback data
const demoCOA: COAAccount[] = [
  { id: '1', code: 'REV-001', name: 'Product Revenue', accountType: 'revenue', statementType: 'income', parentCode: null, level: 1, isIntercompany: false, sortOrder: 1 },
  { id: '2', code: 'REV-002', name: 'Service Revenue', accountType: 'revenue', statementType: 'income', parentCode: null, level: 1, isIntercompany: false, sortOrder: 2 },
  { id: '3', code: 'REV-003', name: 'Intercompany Revenue', accountType: 'revenue', statementType: 'income', parentCode: null, level: 1, isIntercompany: true, sortOrder: 3 },
  { id: '4', code: 'EXP-001', name: 'Cost of Goods Sold', accountType: 'expense', statementType: 'income', parentCode: null, level: 1, isIntercompany: false, sortOrder: 4 },
  { id: '5', code: 'EXP-002', name: 'Operating Expenses', accountType: 'expense', statementType: 'income', parentCode: null, level: 1, isIntercompany: false, sortOrder: 5 },
  { id: '6', code: 'EXP-003', name: 'Depreciation & Amortization', accountType: 'expense', statementType: 'income', parentCode: null, level: 1, isIntercompany: false, sortOrder: 6 },
  { id: '7', code: 'AST-001', name: 'Cash & Cash Equivalents', accountType: 'asset', statementType: 'balance', parentCode: null, level: 1, isIntercompany: false, sortOrder: 7 },
  { id: '8', code: 'AST-002', name: 'Accounts Receivable', accountType: 'asset', statementType: 'balance', parentCode: null, level: 1, isIntercompany: false, sortOrder: 8 },
  { id: '9', code: 'AST-003', name: 'Intercompany Receivable', accountType: 'asset', statementType: 'balance', parentCode: null, level: 1, isIntercompany: true, sortOrder: 9 },
  { id: '10', code: 'AST-004', name: 'Property, Plant & Equipment', accountType: 'asset', statementType: 'balance', parentCode: null, level: 1, isIntercompany: false, sortOrder: 10 },
  { id: '11', code: 'LIA-001', name: 'Accounts Payable', accountType: 'liability', statementType: 'balance', parentCode: null, level: 1, isIntercompany: false, sortOrder: 11 },
  { id: '12', code: 'LIA-002', name: 'Intercompany Payable', accountType: 'liability', statementType: 'balance', parentCode: null, level: 1, isIntercompany: true, sortOrder: 12 },
  { id: '13', code: 'LIA-003', name: 'Long-term Debt', accountType: 'liability', statementType: 'balance', parentCode: null, level: 1, isIntercompany: false, sortOrder: 13 },
  { id: '14', code: 'EQY-001', name: 'Share Capital', accountType: 'equity', statementType: 'balance', parentCode: null, level: 1, isIntercompany: false, sortOrder: 14 },
  { id: '15', code: 'EQY-002', name: 'Retained Earnings', accountType: 'equity', statementType: 'balance', parentCode: null, level: 1, isIntercompany: false, sortOrder: 15 },
  { id: '16', code: 'CF-001', name: 'Operating Cash Flow', accountType: 'revenue', statementType: 'cashflow', parentCode: null, level: 1, isIntercompany: false, sortOrder: 16 },
  { id: '17', code: 'CF-002', name: 'Investing Cash Flow', accountType: 'expense', statementType: 'cashflow', parentCode: null, level: 1, isIntercompany: false, sortOrder: 17 },
  { id: '18', code: 'CF-003', name: 'Financing Cash Flow', accountType: 'expense', statementType: 'cashflow', parentCode: null, level: 1, isIntercompany: false, sortOrder: 18 },
];

const demoMappings: COAMapping[] = [
  { id: 'm1', entityCode: 'PT0001', localAccountCode: '7110', localAccountName: 'Vendas de Produtos', localCOAType: 'SNC', groupCOACode: 'REV-001', groupCOA: { code: 'REV-001', name: 'Product Revenue', accountType: 'revenue', statementType: 'income' } },
  { id: 'm2', entityCode: 'PT0001', localAccountCode: '7120', localAccountName: 'Prestação de Serviços', localCOAType: 'SNC', groupCOACode: 'REV-002', groupCOA: { code: 'REV-002', name: 'Service Revenue', accountType: 'revenue', statementType: 'income' } },
  { id: 'm3', entityCode: 'PT0001', localAccountCode: '3110', localAccountName: 'Caixa e Depósitos', localCOAType: 'SNC', groupCOACode: 'AST-001', groupCOA: { code: 'AST-001', name: 'Cash & Cash Equivalents', accountType: 'asset', statementType: 'balance' } },
  { id: 'm4', entityCode: 'ES0002', localAccountCode: '7000', localAccountName: 'Ventas de Productos', localCOAType: 'PGC', groupCOACode: 'REV-001', groupCOA: { code: 'REV-001', name: 'Product Revenue', accountType: 'revenue', statementType: 'income' } },
  { id: 'm5', entityCode: 'ES0002', localAccountCode: '5700', localAccountName: 'Caja y Bancos', localCOAType: 'PGC', groupCOACode: 'AST-001', groupCOA: { code: 'AST-001', name: 'Cash & Cash Equivalents', accountType: 'asset', statementType: 'balance' } },
  { id: 'm6', entityCode: 'DE0003', localAccountCode: '8400', localAccountName: 'Umsatzerlöse', localCOAType: 'HGB', groupCOACode: 'REV-001', groupCOA: { code: 'REV-001', name: 'Product Revenue', accountType: 'revenue', statementType: 'income' } },
  { id: 'm7', entityCode: 'DE0003', localAccountCode: '1200', localAccountName: 'Kasse und Bank', localCOAType: 'HGB', groupCOACode: 'AST-001', groupCOA: { code: 'AST-001', name: 'Cash & Cash Equivalents', accountType: 'asset', statementType: 'balance' } },
  { id: 'm8', entityCode: 'UK0004', localAccountCode: '4000', localAccountName: 'Sales Revenue', localCOAType: 'IFRS', groupCOACode: 'REV-001', groupCOA: { code: 'REV-001', name: 'Product Revenue', accountType: 'revenue', statementType: 'income' } },
  { id: 'm9', entityCode: 'FR0005', localAccountCode: '7060', localAccountName: 'Prestations de Services', localCOAType: 'PCG', groupCOACode: 'REV-002', groupCOA: { code: 'REV-002', name: 'Service Revenue', accountType: 'revenue', statementType: 'income' } },
  { id: 'm10', entityCode: 'FR0005', localAccountCode: '5120', localAccountName: 'Banque', localCOAType: 'PCG', groupCOACode: 'AST-001', groupCOA: { code: 'AST-001', name: 'Cash & Cash Equivalents', accountType: 'asset', statementType: 'balance' } },
];

function getTypeBadge(type: string) {
  switch (type) {
    case 'revenue':
      return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800 text-xs">Revenue</Badge>;
    case 'expense':
      return <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800 text-xs">Expense</Badge>;
    case 'asset':
      return <Badge className="bg-teal-100 text-teal-700 border-teal-200 hover:bg-teal-100 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800 text-xs">Asset</Badge>;
    case 'liability':
      return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 text-xs">Liability</Badge>;
    case 'equity':
      return <Badge className="bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-800/30 dark:text-slate-400 dark:border-slate-700 text-xs">Equity</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{type}</Badge>;
  }
}

function getStatementBadge(type: string) {
  switch (type) {
    case 'income':
      return <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300 dark:text-emerald-400 dark:border-emerald-700">Income</Badge>;
    case 'balance':
      return <Badge variant="outline" className="text-xs text-teal-600 border-teal-300 dark:text-teal-400 dark:border-teal-700">Balance Sheet</Badge>;
    case 'cashflow':
      return <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700">Cash Flow</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{type}</Badge>;
  }
}

function getLocalCOABadge(type: string) {
  switch (type) {
    case 'SNC':
      return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800 text-[10px]">SNC 🇵🇹</Badge>;
    case 'PGC':
      return <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800 text-[10px]">PGC 🇪🇸</Badge>;
    case 'HGB':
      return <Badge className="bg-teal-100 text-teal-700 border-teal-200 hover:bg-teal-100 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800 text-[10px]">HGB 🇩🇪</Badge>;
    case 'IFRS':
      return <Badge className="bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-800/30 dark:text-slate-400 dark:border-slate-700 text-[10px]">IFRS 🇬🇧</Badge>;
    case 'PCG':
      return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 text-[10px]">PCG 🇫🇷</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px]">{type}</Badge>;
  }
}

export function COAView() {
  const [accounts, setAccounts] = useState<COAAccount[]>([]);
  const [mappings, setMappings] = useState<COAMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatement, setFilterStatement] = useState<string>('all');
  const [mappingFilterEntity, setMappingFilterEntity] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newAccount, setNewAccount] = useState<Partial<COAAccount>>({
    code: '', name: '', accountType: 'asset', statementType: 'balance', level: 1, isIntercompany: false, sortOrder: 0,
  });
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [coaData, mappingData] = await Promise.all([getCOA(), getCOAMappings()]);
      setAccounts(coaData.length > 0 ? coaData : demoCOA);
      setMappings(mappingData.length > 0 ? mappingData : demoMappings);
    } catch (err) {
      console.error('Failed to load chart of accounts', err);
      setAccounts(demoCOA);
      setMappings(demoMappings);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateAccount = async () => {
    if (!newAccount.code || !newAccount.name) return;
    setSaving(true);
    try {
      const created = await createCOAAccount(newAccount);
      setAccounts([...accounts, created]);
      setDialogOpen(false);
      setNewAccount({ code: '', name: '', accountType: 'asset', statementType: 'balance', level: 1, isIntercompany: false, sortOrder: 0 });
      toast({ title: 'Account Created', description: `${created.code} - ${created.name}` });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to create account', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const filteredAccounts = accounts.filter((a) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
    const matchesType = filterType === 'all' || a.accountType === filterType;
    const matchesStatement = filterStatement === 'all' || a.statementType === filterStatement;
    return matchesSearch && matchesType && matchesStatement;
  });

  const filteredMappings = mappings.filter((m) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || m.localAccountCode.toLowerCase().includes(q) || m.localAccountName.toLowerCase().includes(q) || m.groupCOACode.toLowerCase().includes(q);
    const matchesEntity = mappingFilterEntity === 'all' || m.entityCode === mappingFilterEntity;
    return matchesSearch && matchesEntity;
  });

  const entityCodes = [...new Set(mappings.map(m => m.entityCode))].sort();

  // Summary stats
  const typeCounts = accounts.reduce((acc, a) => {
    acc[a.accountType] = (acc[a.accountType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const icCount = accounts.filter(a => a.isIntercompany).length;

  return (
    <div className="space-y-6">
      {loadError && <DataLoadError />}
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Accounts', value: accounts.length, color: 'from-emerald-500/10 to-emerald-600/5', textColor: 'text-emerald-700 dark:text-emerald-400', borderColor: 'border-emerald-200 dark:border-emerald-800/50' },
          { label: 'IC Accounts', value: icCount, color: 'from-amber-500/10 to-amber-600/5', textColor: 'text-amber-700 dark:text-amber-400', borderColor: 'border-amber-200 dark:border-amber-800/50' },
          { label: 'Entity Mappings', value: mappings.length, color: 'from-teal-500/10 to-teal-600/5', textColor: 'text-teal-700 dark:text-teal-400', borderColor: 'border-teal-200 dark:border-teal-800/50' },
          { label: 'Account Types', value: Object.keys(typeCounts).length, color: 'from-slate-500/10 to-slate-600/5', textColor: 'text-slate-700 dark:text-slate-400', borderColor: 'border-slate-200 dark:border-slate-700/50' },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.4 }}
          >
            <Card className={`bg-gradient-to-br ${card.color} border ${card.borderColor} shadow-sm hover:shadow-lg hover:shadow-emerald-500/5 transition-shadow duration-300`}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{card.label}</p>
                <p className={`text-2xl font-bold mt-1 ${card.textColor}`}>{card.value}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Main Card with Tabs */}
      <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-600" />
            Chart of Accounts
          </CardTitle>
          <CardDescription>Group COA structure and entity-level mapping configuration</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="group-coa" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <TabsList className="bg-slate-100 dark:bg-slate-800">
                <TabsTrigger value="group-coa">Group COA</TabsTrigger>
                <TabsTrigger value="entity-mappings">Entity Mappings</TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search accounts..."
                    className="pl-10 w-48 h-8 text-sm"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-emerald-600 hover:bg-emerald-700 h-8 text-sm">
                      <Plus className="w-4 h-4 mr-1" />
                      Add Account
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Add New COA Account</DialogTitle>
                      <DialogDescription>Create a new account in the group chart of accounts</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Account Code</Label>
                          <Input placeholder="e.g. REV-004" value={newAccount.code || ''}
                            onChange={(e) => setNewAccount({ ...newAccount, code: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Account Name</Label>
                          <Input placeholder="e.g. Other Revenue" value={newAccount.name || ''}
                            onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Account Type</Label>
                          <Select value={newAccount.accountType || 'asset'} onValueChange={(v) => setNewAccount({ ...newAccount, accountType: v as COAAccount['accountType'] })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="revenue">Revenue</SelectItem>
                              <SelectItem value="expense">Expense</SelectItem>
                              <SelectItem value="asset">Asset</SelectItem>
                              <SelectItem value="liability">Liability</SelectItem>
                              <SelectItem value="equity">Equity</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Statement Type</Label>
                          <Select value={newAccount.statementType || 'balance'} onValueChange={(v) => setNewAccount({ ...newAccount, statementType: v as COAAccount['statementType'] })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="income">Income Statement</SelectItem>
                              <SelectItem value="balance">Balance Sheet</SelectItem>
                              <SelectItem value="cashflow">Cash Flow</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Level</Label>
                          <Input type="number" min={1} max={5} value={newAccount.level || 1}
                            onChange={(e) => setNewAccount({ ...newAccount, level: parseInt(e.target.value) })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Sort Order</Label>
                          <Input type="number" value={newAccount.sortOrder || 0}
                            onChange={(e) => setNewAccount({ ...newAccount, sortOrder: parseInt(e.target.value) })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Intercompany</Label>
                          <Select value={newAccount.isIntercompany ? 'yes' : 'no'} onValueChange={(v) => setNewAccount({ ...newAccount, isIntercompany: v === 'yes' })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="no">No</SelectItem>
                              <SelectItem value="yes">Yes</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                      <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleCreateAccount} disabled={saving}>
                        {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                        Create Account
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Group COA Tab */}
            <TabsContent value="group-coa">
              <div className="flex flex-wrap gap-2 mb-4">
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Type:</span>
                </div>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-32 h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="revenue">Revenue</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="asset">Asset</SelectItem>
                    <SelectItem value="liability">Liability</SelectItem>
                    <SelectItem value="equity">Equity</SelectItem>
                  </SelectContent>
                </Select>
                <Separator orientation="vertical" className="h-7" />
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Statement:</span>
                </div>
                <Select value={filterStatement} onValueChange={setFilterStatement}>
                  <SelectTrigger className="w-36 h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statements</SelectItem>
                    <SelectItem value="income">Income Statement</SelectItem>
                    <SelectItem value="balance">Balance Sheet</SelectItem>
                    <SelectItem value="cashflow">Cash Flow</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading accounts...</span>
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto rounded-lg border">
                  <Table className="premium-table">
                    <TableHeader>
                      <TableRow className="cursor-pointer transition-colors duration-150 bg-slate-50 dark:bg-slate-800/50">
                        <TableHead className="w-28">Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="w-28">Type</TableHead>
                        <TableHead className="w-32">Statement</TableHead>
                        <TableHead className="w-16 text-center">Level</TableHead>
                        <TableHead className="w-24 text-center">IC</TableHead>
                        <TableHead className="w-20 text-right">Sort</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <AnimatePresence>
                        {filteredAccounts.map((account, index) => (
                          <motion.tr
                            key={account.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.02, duration: 0.3 }}
                            className="hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-colors"
                          >
                            <TableCell className="font-mono font-semibold text-sm">{account.code}</TableCell>
                            <TableCell className="font-medium text-sm">
                              {account.level > 1 && <span className="text-muted-foreground mr-2">{'  '.repeat(account.level - 1)}└</span>}
                              {account.name}
                            </TableCell>
                            <TableCell>{getTypeBadge(account.accountType)}</TableCell>
                            <TableCell>{getStatementBadge(account.statementType)}</TableCell>
                            <TableCell className="text-center text-sm text-muted-foreground">{account.level}</TableCell>
                            <TableCell className="text-center">
                              {account.isIntercompany ? (
                                <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800 text-[10px]">IC</Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">{account.sortOrder}</TableCell>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </TableBody>
                  </Table>
                  {filteredAccounts.length === 0 && (
                    <div className="text-center py-8 text-sm text-muted-foreground">No accounts match your filters</div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Entity Mappings Tab */}
            <TabsContent value="entity-mappings">
              <div className="flex flex-wrap gap-2 mb-4">
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Entity:</span>
                </div>
                <Select value={mappingFilterEntity} onValueChange={setMappingFilterEntity}>
                  <SelectTrigger className="w-36 h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Entities</SelectItem>
                    {entityCodes.map(code => (
                      <SelectItem key={code} value={code}>{code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading mappings...</span>
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto rounded-lg border">
                  <Table className="premium-table">
                    <TableHeader>
                      <TableRow className="cursor-pointer transition-colors duration-150 bg-slate-50 dark:bg-slate-800/50">
                        <TableHead className="w-28">Entity</TableHead>
                        <TableHead className="w-24">Local Code</TableHead>
                        <TableHead>Local Account Name</TableHead>
                        <TableHead className="w-24">Local COA</TableHead>
                        <TableHead className="w-8" />
                        <TableHead className="w-28">Group Code</TableHead>
                        <TableHead>Group Account Name</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <AnimatePresence>
                        {filteredMappings.map((mapping, index) => (
                          <motion.tr
                            key={mapping.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.02, duration: 0.3 }}
                            className="hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-colors"
                          >
                            <TableCell>
                              <Badge variant="outline" className="font-mono text-xs">{mapping.entityCode}</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{mapping.localAccountCode}</TableCell>
                            <TableCell className="font-medium text-sm">{mapping.localAccountName}</TableCell>
                            <TableCell>{getLocalCOABadge(mapping.localCOAType)}</TableCell>
                            <TableCell className="text-center">
                              <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
                            </TableCell>
                            <TableCell className="font-mono font-semibold text-sm">{mapping.groupCOACode}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{mapping.groupCOA?.name || '—'}</TableCell>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </TableBody>
                  </Table>
                  {filteredMappings.length === 0 && (
                    <div className="text-center py-8 text-sm text-muted-foreground">No mappings match your filters</div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
