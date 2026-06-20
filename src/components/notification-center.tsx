'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, CheckCircle2, AlertTriangle, DollarSign, Upload, Settings, ArrowRight, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { getNotifications, markNotificationsRead } from '@/lib/api';
import { AppNotification, NotificationType, NotificationPriority } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// ============================================================
// TYPE ICONS & COLORS
// ============================================================
const typeConfig: Record<NotificationType, { icon: React.ElementType; color: string; bgColor: string }> = {
  consolidation_complete: { icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30' },
  fx_rate_change: { icon: DollarSign, color: 'text-teal-600 dark:text-teal-400', bgColor: 'bg-teal-100 dark:bg-teal-900/30' },
  validation_warning: { icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-100 dark:bg-amber-900/30' },
  data_import: { icon: Upload, color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30' },
  system_alert: { icon: Settings, color: 'text-slate-600 dark:text-slate-400', bgColor: 'bg-slate-100 dark:bg-slate-800/50' },
};

const priorityConfig: Record<NotificationPriority, { color: string; label: string }> = {
  high: { color: 'bg-red-500', label: 'High' },
  medium: { color: 'bg-amber-500', label: 'Med' },
  low: { color: 'bg-slate-400', label: 'Low' },
};

// ============================================================
// RELATIVE TIME
// ============================================================
function relativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ============================================================
// NOTIFICATION CENTER COMPONENT
// ============================================================
export function NotificationCenter() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await getNotifications();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // Fallback: empty state
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    // Poll every 30 seconds
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleMarkAllRead = async () => {
    try {
      await markNotificationsRead(['all']);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // Silently fail
    }
  };

  const handleMarkSingleRead = async (id: string) => {
    try {
      await markNotificationsRead([id]);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Silently fail
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors"
        >
          <Bell className="h-4 w-4 text-muted-foreground" />
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-0.5 -right-0.5 flex items-center justify-center"
            >
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" />
              <span className="relative inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-[9px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            </motion.span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 sm:w-96 p-0" align="end" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-emerald-50/80 to-teal-50/80 dark:from-emerald-950/20 dark:to-teal-950/20">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
            {unreadCount > 0 && (
              <Badge className="text-[9px] bg-red-500 text-white hover:bg-red-600 h-5 px-1.5">
                {unreadCount} new
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-[10px] h-6 px-2 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300"
              onClick={handleMarkAllRead}
            >
              Mark all read
            </Button>
          )}
        </div>

        {/* Notification List */}
        <div className="max-h-96 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                    <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center">
              <Bell className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No notifications</p>
            </div>
          ) : (
            <AnimatePresence>
              {notifications.map((notification, idx) => {
                const config = typeConfig[notification.type];
                const Icon = config.icon;
                const prioConfig = priorityConfig[notification.priority];

                return (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: idx * 0.03, duration: 0.2 }}
                    className={cn(
                      'relative px-4 py-3 border-b last:border-b-0 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer group',
                      !notification.isRead && 'bg-emerald-50/30 dark:bg-emerald-950/10'
                    )}
                    onClick={() => {
                      if (!notification.isRead) handleMarkSingleRead(notification.id);
                    }}
                  >
                    {/* Unread indicator - left border */}
                    {!notification.isRead && (
                      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-emerald-500" />
                    )}

                    <div className="flex gap-3">
                      {/* Type Icon */}
                      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0', config.bgColor)}>
                        <Icon className={cn('w-4 h-4', config.color)} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn(
                            'text-xs leading-tight',
                            !notification.isRead ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'
                          )}>
                            {notification.title}
                          </p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Priority badge */}
                            <span className={cn('w-1.5 h-1.5 rounded-full', prioConfig.color)} title={prioConfig.label} />
                            <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                              {relativeTime(notification.timestamp)}
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                          {notification.message}
                        </p>
                        {notification.entityCode && (
                          <Badge variant="outline" className="text-[8px] h-4 mt-1 px-1 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400">
                            {notification.entityCode}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Hover action */}
                    {!notification.isRead && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-3 h-3 text-muted-foreground" />
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>

        {/* Footer */}
        <Separator />
        <div className="px-4 py-2.5 bg-slate-50/50 dark:bg-slate-900/50">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 h-7"
          >
            View All Notifications
            <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
