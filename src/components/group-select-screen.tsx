'use client';

import { useState, useEffect } from 'react';
import { Plus, Building2, Layers, Loader2, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getPacks, loadPack, createGroup, PackSummary } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';

const countryFlags: Record<string, string> = {
  PT: '🇵🇹', ES: '🇪🇸', DE: '🇩🇪', GB: '🇬🇧', FR: '🇫🇷',
  IT: '🇮🇹', NL: '🇳🇱', US: '🇺🇸', CH: '🇨🇭', JP: '🇯🇵',
};

export function GroupSelectScreen() {
  const { setSelectedCompany, setActiveView } = useAppStore();
  const [packs, setPacks] = useState<PackSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingGroupId, setLoadingGroupId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupPeriod, setNewGroupPeriod] = useState('2024-12');
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    getPacks()
      .then((data) => {
        if (!cancelled) setPacks(data);
      })
      .catch((err) => {
        console.error('Failed to load groups:', err);
        if (!cancelled) toast({ title: 'Error', description: 'Could not load groups', variant: 'destructive' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [toast]);

  // Load a group's data and enter its consolidated dashboard.
  const handleSelectGroup = async (pack: PackSummary) => {
    setLoadingGroupId(pack.id);
    try {
      await loadPack(pack.id, true);
      setActiveView('dashboard');
      setSelectedCompany({ code: 'GROUP', name: pack.name });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      setLoadingGroupId(null);
    }
  };

  // Create a fresh empty group, then land in Entity Management to add companies.
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setSaving(true);
    try {
      await createGroup(newGroupName.trim(), newGroupPeriod);
      setDialogOpen(false);
      toast({ title: 'Group Created', description: `${newGroupName.trim()} — add companies to begin.` });
      setActiveView('entities');
      setSelectedCompany({ code: 'GROUP', name: newGroupName.trim() });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Distinct member-country flags for a group (deduped, capped).
  const groupFlags = (pack: PackSummary) =>
    Array.from(new Set(pack.entities.map((e) => e.countryCode)))
      .map((cc) => countryFlags[cc] || '🌍')
      .slice(0, 6);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 bg-grid-pattern px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-4xl"
      >
        {/* Branding header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20 mb-4">
            <Layers className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">ConsolidaçãoFX</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Select a group to load all its companies, or create a new one
          </p>
        </div>

        {/* Group cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {loading
            ? Array.from({ length: 2 }).map((_, i) => (
                <Card key={i} className="shadow-sm">
                  <CardContent className="p-5 space-y-3">
                    <Skeleton className="h-11 w-11 rounded-xl" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                  </CardContent>
                </Card>
              ))
            : packs.map((pack, index) => {
                const isLoading = loadingGroupId === pack.id;
                const disabled = loadingGroupId !== null;
                return (
                  <motion.div
                    key={pack.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05, duration: 0.3 }}
                  >
                    <Card
                      className={`h-full border-emerald-200 dark:border-emerald-800/50 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 transition-all duration-200 group ${
                        disabled ? 'opacity-60 pointer-events-none' : 'cursor-pointer hover:shadow-lg hover:shadow-emerald-500/10 hover:scale-[1.01]'
                      }`}
                      onClick={() => !disabled && handleSelectGroup(pack)}
                    >
                      <CardContent className="p-5">
                        <div className="flex items-start gap-4">
                          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0">
                            {isLoading
                              ? <Loader2 className="w-5 h-5 text-white animate-spin" />
                              : <Layers className="w-5 h-5 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold truncate" title={pack.name}>{pack.name}</p>
                              <ArrowRight className="w-5 h-5 text-emerald-600 dark:text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2" title={pack.description}>
                              {pack.description}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-4 flex-wrap">
                          <Badge variant="outline" className="text-[10px] gap-1 flex items-center">
                            <Building2 className="w-3 h-3" />
                            {pack.entities.length} {pack.entities.length === 1 ? 'company' : 'companies'}
                          </Badge>
                          <span className="text-base leading-none">{groupFlags(pack).join(' ')}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}

          {/* Add new group card */}
          {!loading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: packs.length * 0.05, duration: 0.3 }}
            >
              <Card
                className={`h-full min-h-[140px] border-2 border-dashed border-slate-300 dark:border-slate-700 bg-transparent shadow-none transition-all duration-200 group ${
                  loadingGroupId !== null
                    ? 'opacity-60 pointer-events-none'
                    : 'cursor-pointer hover:border-emerald-400 dark:hover:border-emerald-600 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20'
                }`}
                onClick={() => loadingGroupId === null && setDialogOpen(true)}
              >
                <CardContent className="p-5 h-full flex flex-col items-center justify-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/40 flex items-center justify-center transition-colors">
                    <Plus className="w-5 h-5 text-slate-500 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                    Add New Group
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>

        <p className="text-center text-[10px] text-muted-foreground mt-10">
          ConsolidaçãoFX © 2025 · Multi-Company Financial Consolidation Platform
        </p>
      </motion.div>

      {/* Add group dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !saving && setDialogOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-600" />
              Add New Group
            </DialogTitle>
            <DialogDescription>
              Creates an empty group. You'll then add its companies. This replaces the currently loaded group.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="group-name">Group Name</Label>
              <Input
                id="group-name"
                placeholder="e.g. Acme Group"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-period">Reporting Period</Label>
              <Input
                id="group-period"
                placeholder="YYYY-MM"
                value={newGroupPeriod}
                onChange={(e) => setNewGroupPeriod(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleCreateGroup}
              disabled={saving || !newGroupName.trim() || !/^\d{4}-\d{2}$/.test(newGroupPeriod)}
            >
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Create Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
