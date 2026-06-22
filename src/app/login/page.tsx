'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Building2, LogIn, ShieldCheck, Eye, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

// Public demo credentials — one account per capability tier. Safe to display:
// this is a single-tenant portfolio demo. Real deployments create their own
// users and set AUTH_SECRET.
const DEMO_ACCOUNTS = [
  { role: 'approver', email: 'approver@demo.local', password: 'approver', icon: ShieldCheck },
  { role: 'preparer', email: 'preparer@demo.local', password: 'preparer', icon: PenLine },
  { role: 'viewer', email: 'viewer@demo.local', password: 'viewer', icon: Eye },
] as const;

export default function LoginPage() {
  const t = useTranslations('login');
  const tAuth = useTranslations('auth');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(credentials?: { email: string; password: string }) {
    const body = credentials ?? { email, password };
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.push('/');
        router.refresh();
        return;
      }
      setError(res.status === 401 ? t('invalid') : t('error'));
    } catch {
      setError(t('error'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background bg-grid-pattern p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-slate-900 border border-amber-500/30 text-amber-400">
            <Building2 className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Consolidação<span className="text-amber-500">FX</span>
          </h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LogIn className="w-4 h-4 text-signal" />
              {t('title')}
            </CardTitle>
            <CardDescription>{t('hint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!submitting) submit();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="email">{t('email')}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">{t('password')}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && (
                <p className="text-sm text-loss" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? t('submitting') : t('submit')}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="bg-muted/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{t('demoTitle')}</CardTitle>
            <CardDescription className="text-xs">{t('demoHint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {DEMO_ACCOUNTS.map((acc) => {
              const Icon = acc.icon;
              return (
                <button
                  key={acc.role}
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setEmail(acc.email);
                    setPassword(acc.password);
                    submit({ email: acc.email, password: acc.password });
                  }}
                  className="w-full flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-left text-sm hover:border-signal/50 hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <Icon className="w-4 h-4 text-signal shrink-0" />
                  <span className="flex-1">
                    <span className="font-medium">{tAuth(acc.role)}</span>
                    <span className="block text-[11px] text-muted-foreground">{tAuth(`${acc.role}Desc`)}</span>
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">{acc.email}</span>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <div className="text-center">
          <a href="/" className="text-xs text-muted-foreground hover:text-signal transition-colors">
            {t('backToApp')}
          </a>
        </div>
      </div>
    </div>
  );
}
