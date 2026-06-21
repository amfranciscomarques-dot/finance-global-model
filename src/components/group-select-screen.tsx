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
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('groupSelect');

  useEffect(() => {
    let cancelled = false;
    getPacks()
      .then((data) => {
        if (!cancelled) setPacks(data);
      })
      .catch((err) => {
        console.error('Failed to load groups:', err);
        if (!cancelled) toast({ title: t('loadErrorTitle'), description: t('loadErrorDesc'), variant: 'destructive' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [toast, t]);

  // Load a group's data and enter its consolidated dashboard.
  const handleSelectGroup = async (pack: PackSummary) => {
    setLoadingGroupId(pack.id);
    try {
      await loadPack(pack.id, true);
      setActiveView('dashboard');
      setSelectedCompany({ code: 'GROUP', name: pack.name });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to load group', variant: 'destructive' });
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
      toast({ title: t('createdTitle'), description: t('createdDesc', { name: newGroupName.trim() }) });
      setActiveView('entities');
      setSelectedCompany({ code: 'GROUP', name: newGroupName.trim() });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to create group', variant: 'destructive' });
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-background bg-grid-pattern px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-4xl"
      >
        {/* Branding header — instrument wordmark */}
        <div className="text-center mb-10">
          <p className="font-mono text-[11px] tracking-[0.32em] text-muted-foreground uppercase mb-3">
            {t('eyebrow')}
          </p>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
            Consolidação<span className="text-signal">FX</span>
          </h1>
          <div className="mx-auto mt-4 mb-4 h-px w-16 bg-signal/70" />
          <p className="text-sm text-muted-foreground">
            {t('subtitle')}
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
                      className={`group relative h-full overflow-hidden border-border bg-card transition-all duration-200 ${
                        disabled ? 'opacity-60 pointer-events-none' : 'cursor-pointer hover:border-signal/60 hover:shadow-lg hover:shadow-signal/5'
                      }`}
                      onClick={() => !disabled && handleSelectGroup(pack)}
                    >
                      {/* amber signal rail — reveals on hover */}
                      <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-signal scale-y-0 group-hover:scale-y-100 origin-top transition-transform duration-300" />
                      <CardContent className="p-5">
                        <div className="flex items-start gap-4">
                          <div className="w-11 h-11 rounded-md border border-border bg-muted flex items-center justify-center text-foreground/65 group-hover:text-signal group-hover:border-signal/40 transition-colors shrink-0">
                            {isLoading
                              ? <Loader2 className="w-5 h-5 animate-spin" />
                              : <Layers className="w-5 h-5" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold truncate" title={pack.name}>{pack.name}</p>
                              <ArrowRight className="w-5 h-5 text-signal opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" />
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2" title={pack.description}>
                              {pack.description}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-4 flex-wrap">
                          <Badge variant="outline" className="text-[10px] gap-1 flex items-center font-mono tabular-nums">
                            <Building2 className="w-3 h-3" />
                            {t('companies', { count: pack.entities.length })}
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
                className={`h-full min-h-[140px] border-2 border-dashed border-border bg-transparent shadow-none transition-all duration-200 group ${
                  loadingGroupId !== null
                    ? 'opacity-60 pointer-events-none'
                    : 'cursor-pointer hover:border-signal/60 hover:bg-signal/5'
                }`}
                onClick={() => loadingGroupId === null && setDialogOpen(true)}
              >
                <CardContent className="p-5 h-full flex flex-col items-center justify-center gap-2">
                  <div className="w-10 h-10 rounded-md border border-border bg-muted group-hover:border-signal/40 flex items-center justify-center transition-colors">
                    <Plus className="w-5 h-5 text-muted-foreground group-hover:text-signal transition-colors" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                    {t('addNewGroup')}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>

        <p className="text-center text-[10px] text-muted-foreground mt-10">
          ConsolidaçãoFX © 2025 · {t('footer')}
        </p>
      </motion.div>

      {/* Add group dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !saving && setDialogOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-signal" />
              {t('addNewGroup')}
            </DialogTitle>
            <DialogDescription>
              {t('dialogDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="group-name">{t('groupName')}</Label>
              <Input
                id="group-name"
                placeholder={t('groupNamePlaceholder')}
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-period">{t('reportingPeriod')}</Label>
              <Input
                id="group-period"
                placeholder="YYYY-MM"
                value={newGroupPeriod}
                onChange={(e) => setNewGroupPeriod(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>{t('cancel')}</Button>
            <Button
              onClick={handleCreateGroup}
              disabled={saving || !newGroupName.trim() || !/^\d{4}-\d{2}$/.test(newGroupPeriod)}
            >
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              {t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
