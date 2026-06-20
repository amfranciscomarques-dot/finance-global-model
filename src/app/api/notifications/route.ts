import { NextResponse } from 'next/server';

// ============================================================
// NOTIFICATION TYPES
// ============================================================
type NotificationType = 'consolidation_complete' | 'fx_rate_change' | 'validation_warning' | 'data_import' | 'system_alert';
type Priority = 'low' | 'medium' | 'high';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  priority: Priority;
  entityCode?: string;
}

// ============================================================
// IN-MEMORY NOTIFICATION STORE
// ============================================================
const now = new Date();
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60000).toISOString();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();

let notifications: Notification[] = [
  {
    id: 'notif-001',
    type: 'consolidation_complete',
    title: 'Consolidation Run Completed',
    message: 'Full group consolidation for Dec 2024 completed successfully. Revenue: €6.9M, Net Income: €1.8M.',
    timestamp: minutesAgo(3),
    isRead: false,
    priority: 'high',
    entityCode: 'ALL',
  },
  {
    id: 'notif-002',
    type: 'fx_rate_change',
    title: 'GBP/EUR Rate Updated',
    message: 'GBP/EUR closing rate updated from 1.1620 to 1.1585 (-0.30%). Impact on TechNova UK financials.',
    timestamp: minutesAgo(12),
    isRead: false,
    priority: 'high',
    entityCode: 'UK0001',
  },
  {
    id: 'notif-003',
    type: 'validation_warning',
    title: 'Balance Sheet Imbalance Detected',
    message: 'Consolidation run shows balance check of €827. Rounding tolerance threshold is €1.00.',
    timestamp: minutesAgo(25),
    isRead: false,
    priority: 'medium',
    entityCode: 'ALL',
  },
  {
    id: 'notif-004',
    type: 'data_import',
    title: 'Trial Balance Import Completed',
    message: 'Successfully imported 540 trial balance records for TechNova Portugal (PT0001), period Dec 2024.',
    timestamp: hoursAgo(1),
    isRead: false,
    priority: 'low',
    entityCode: 'PT0001',
  },
  {
    id: 'notif-005',
    type: 'fx_rate_change',
    title: 'USD/EUR Rate Updated',
    message: 'USD/EUR closing rate changed from 0.9215 to 0.9180 (-0.38%). Affects TechNova US translation.',
    timestamp: hoursAgo(1.5),
    isRead: false,
    priority: 'medium',
    entityCode: 'US0001',
  },
  {
    id: 'notif-006',
    type: 'consolidation_complete',
    title: 'Scenario Analysis Completed',
    message: 'Optimistic scenario projection finished. Projected revenue: €7.8M (+13.0% vs base).',
    timestamp: hoursAgo(2),
    isRead: true,
    priority: 'medium',
  },
  {
    id: 'notif-007',
    type: 'system_alert',
    title: 'Database Maintenance Scheduled',
    message: 'Automated database optimization scheduled for tonight at 02:00 UTC. Expected downtime: 5 minutes.',
    timestamp: hoursAgo(3),
    isRead: true,
    priority: 'low',
  },
  {
    id: 'notif-008',
    type: 'validation_warning',
    title: 'Missing IC Transaction Match',
    message: 'IC transaction IC-2024-0045 from TechNova DE to TechNova FR has no matching counterparty entry.',
    timestamp: hoursAgo(4),
    isRead: false,
    priority: 'high',
    entityCode: 'DE0001',
  },
  {
    id: 'notif-009',
    type: 'data_import',
    title: 'Bulk Import Completed',
    message: 'Imported 2,160 trial balance records across 5 entities for Q4 2024. 3 validation warnings detected.',
    timestamp: hoursAgo(5),
    isRead: true,
    priority: 'medium',
  },
  {
    id: 'notif-010',
    type: 'fx_rate_change',
    title: 'ECB Rate Sync Completed',
    message: 'Synchronized 14 exchange rates from ECB API. 2 rates updated: BRL/EUR, CHF/EUR.',
    timestamp: hoursAgo(8),
    isRead: true,
    priority: 'low',
  },
  {
    id: 'notif-011',
    type: 'system_alert',
    title: 'New Version Available',
    message: 'ConsolidaçãoFX v2.6.0 is available. Includes PDF export, real-time notifications, and performance improvements.',
    timestamp: daysAgo(1),
    isRead: true,
    priority: 'low',
  },
  {
    id: 'notif-012',
    type: 'consolidation_complete',
    title: 'IC Eliminations Processed',
    message: '18 intercompany eliminations applied for Dec 2024. IC revenue eliminated: €420K, IC receivables: €180K.',
    timestamp: daysAgo(1),
    isRead: true,
    priority: 'medium',
    entityCode: 'ALL',
  },
  {
    id: 'notif-013',
    type: 'validation_warning',
    title: 'Ownership Percentage Mismatch',
    message: 'TechNova FR (FR0001) ownership is 70% but consolidation method is Full. Consider switching to Proportional.',
    timestamp: daysAgo(2),
    isRead: true,
    priority: 'medium',
    entityCode: 'FR0001',
  },
  {
    id: 'notif-014',
    type: 'data_import',
    title: 'Import Validation Failed',
    message: 'CSV import for TechNova UK contained 12 rows with invalid account codes. Please review and re-upload.',
    timestamp: daysAgo(2),
    isRead: true,
    priority: 'high',
    entityCode: 'UK0001',
  },
  {
    id: 'notif-015',
    type: 'system_alert',
    title: 'Backup Completed',
    message: 'Automated database backup completed successfully. Size: 24.3 MB. Stored in /backups/2024-12-30.db.',
    timestamp: daysAgo(3),
    isRead: true,
    priority: 'low',
  },
  {
    id: 'notif-016',
    type: 'fx_rate_change',
    title: 'BRL/EUR Significant Movement',
    message: 'BRL/EUR rate moved 2.4% in the last 24 hours (6.12 → 5.97). May impact TechNova BR translation significantly.',
    timestamp: daysAgo(3),
    isRead: true,
    priority: 'high',
    entityCode: 'BR0001',
  },
];

// ============================================================
// GET /api/notifications - Returns notifications list
// ============================================================
export async function GET() {
  // Sort by timestamp (newest first)
  const sorted = [...notifications].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return NextResponse.json({
    notifications: sorted,
    unreadCount,
    total: notifications.length,
  });
}

// ============================================================
// POST /api/notifications - Mark notifications as read
// ============================================================
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { notificationIds } = body as { notificationIds?: string[] };

    if (!notificationIds || !Array.isArray(notificationIds)) {
      return NextResponse.json(
        { error: 'notificationIds must be an array of strings' },
        { status: 400 }
      );
    }

    // If "all" is passed, mark all as read
    if (notificationIds.includes('all')) {
      notifications = notifications.map((n) => ({ ...n, isRead: true }));
    } else {
      const idSet = new Set(notificationIds);
      notifications = notifications.map((n) =>
        idSet.has(n.id) ? { ...n, isRead: true } : n
      );
    }

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    return NextResponse.json({
      success: true,
      markedRead: notificationIds.includes('all') ? notifications.length : notificationIds.length,
      unreadCount,
    });
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}
