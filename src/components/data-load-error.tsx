'use client';

import { AlertTriangle } from 'lucide-react';

// ============================================================
// DATA-LOAD ERROR BANNER
//
// Shown at the top of a view when its live fetch fails and the screen falls
// back to placeholder/demo figures. Before this, every view swallowed the error
// in a `catch { console.log('Using fallback…') }` and rendered fabricated
// numbers with no signal — dangerous in a finance app where the user can't tell
// real data from demo (F5). Render `{loadError && <DataLoadError />}` next to the
// view's outer container and flip `loadError` in the fetch's catch block.
// ============================================================

export const DATA_LOAD_ERROR_MESSAGE =
  'Could not load live data from the server. Showing placeholder figures below.';

export function DataLoadError({ message = DATA_LOAD_ERROR_MESSAGE }: { message?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-amber-800 dark:text-amber-300">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <p className="text-xs">{message}</p>
    </div>
  );
}
