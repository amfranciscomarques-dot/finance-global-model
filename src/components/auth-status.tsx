'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { LogIn, LogOut, ShieldCheck, PenLine, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MeUser {
  id: string;
  email: string;
  name: string;
  role: 'viewer' | 'preparer' | 'approver';
}

const roleIcon = { approver: ShieldCheck, preparer: PenLine, viewer: Eye } as const;
const roleColor = {
  approver: 'text-amber-500 border-amber-500/30',
  preparer: 'text-signal border-signal/30',
  viewer: 'text-muted-foreground border-border',
} as const;

// Compact account indicator for the header. Shows the signed-in role + a logout
// button, or a "Sign in" link. Reflects the session the middleware enforces; it
// is informational only — authorization is decided server-side.
export function AuthStatus() {
  const t = useTranslations('auth');
  const [user, setUser] = useState<MeUser | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (active) setUser(d.user ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!loaded) return null;

  if (!user) {
    return (
      <a
        href="/login"
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-signal transition-colors border border-border rounded-md px-2 py-1"
        title={t('signIn')}
      >
        <LogIn className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{t('signIn')}</span>
      </a>
    );
  }

  const Icon = roleIcon[user.role];

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  }

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn('flex items-center gap-1.5 text-[11px] border rounded-md px-2 py-1', roleColor[user.role])}
        title={t('signedInAs', { name: user.name })}
      >
        <Icon className="w-3.5 h-3.5" />
        <span className="hidden sm:inline font-medium">{t(user.role)}</span>
      </span>
      <button
        onClick={logout}
        className="flex items-center justify-center text-muted-foreground hover:text-loss transition-colors border border-border rounded-md p-1"
        title={t('signOut')}
        aria-label={t('signOut')}
      >
        <LogOut className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
