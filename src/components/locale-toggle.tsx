'use client';

import { useLocaleSwitcher, type Locale } from '@/i18n/locale-context';
import { cn } from '@/lib/utils';

const LOCALES: Locale[] = ['en', 'pt'];

// Segmented EN | PT control. Compact enough for the header chrome; the active
// segment carries the amber signal accent.
export function LocaleToggle({ className }: { className?: string }) {
  const { locale, setLocale } = useLocaleSwitcher();
  return (
    <div
      role="group"
      aria-label="Language"
      className={cn(
        'inline-flex items-center rounded-md border border-border bg-muted/60 p-0.5 text-[10px] font-mono font-medium',
        className,
      )}
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          className={cn(
            'px-2 py-0.5 rounded-[4px] uppercase tracking-wide transition-colors duration-150',
            locale === l
              ? 'bg-signal text-signal-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
