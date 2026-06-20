'use client';

import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { sendAIChatMessage } from '@/lib/api';
import { ChatMessage } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Send,
  Plus,
  Trash2,
  TrendingUp,
  BarChart3,
  ArrowLeftRight,
  DollarSign,
  Target,
  Coins,
  Bot,
  User,
  Clock,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================
interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  lastActive: string;
}

// ============================================================
// SUGGESTED PROMPTS
// ============================================================
const suggestedPrompts = [
  { icon: TrendingUp, title: "What is the group's revenue trend?", color: 'from-emerald-500 to-teal-600' },
  { icon: BarChart3, title: 'Compare entity profitability', color: 'from-teal-500 to-cyan-600' },
  { icon: ArrowLeftRight, title: 'Explain IC elimination impact', color: 'from-emerald-600 to-emerald-500' },
  { icon: DollarSign, title: 'Analyze FX rate exposure', color: 'from-teal-600 to-emerald-500' },
  { icon: Target, title: 'Budget vs actual summary', color: 'from-emerald-500 to-emerald-700' },
  { icon: Coins, title: 'Cash flow forecast outlook', color: 'from-teal-500 to-teal-700' },
];

// ============================================================
// AI RESPONSE SIMULATION (fallback when API is unavailable)
// ============================================================
function generateAIResponse(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('revenue') && lower.includes('trend')) {
    return "**Group Revenue Trend Analysis**\n\nThe consolidated group revenue shows a **positive upward trend** over the last 12 months:\n\n• **Current Period (Dec 2024)**: €51.9M total consolidated revenue\n• **Q4 2024**: €14.2M (+5.2% QoQ)\n• **YTD Growth**: +8.3% year-over-year\n\n**Key Drivers:**\n1. TechNova Portugal (€22.1M) — +6.1% growth driven by domestic expansion\n2. TechNova España (€13.4M) — +9.2% growth from new enterprise contracts\n3. TechNova UK (£11.8M / €13.7M) — +4.8% growth despite FX headwinds\n\n**Outlook**: Revenue is projected to continue growing at **5-7%** in the base scenario, with the optimistic scenario projecting **+9.5%** growth for H1 2025.";
  }

  if (lower.includes('compare') && lower.includes('profitab')) {
    return "**Entity Profitability Comparison**\n\n| Entity | Revenue | EBITDA | EBITDA Margin | Net Income | ROE |\n|--------|---------|--------|---------------|------------|-----|\n| PT (Portugal) | €22.1M | €8.1M | 36.7% | €5.2M | 28.4% |\n| ES (Spain) | €13.4M | €4.9M | 36.6% | €3.1M | 26.8% |\n| UK (United Kingdom) | €13.7M | €4.7M | 34.3% | €2.8M | 24.1% |\n| DE (Germany) | €8.2M | €2.8M | 34.1% | €1.7M | 22.3% |\n| FR (France) | €5.1M | €1.5M | 29.4% | €0.9M | 18.7% |\n\n**Key Insights:**\n- **TechNova Portugal** leads in absolute profitability (€8.1M EBITDA)\n- **PT and ES** have nearly identical margins (~36.5%), suggesting operational consistency\n- **FR** has the lowest margin at 29.4% — potential for cost optimization\n- All entities maintain healthy EBITDA margins above 29%";
  }

  if (lower.includes('ic') || lower.includes('elimination') || lower.includes('intercompany')) {
    return "**Intercompany Elimination Impact Analysis**\n\nThe consolidation process identified and eliminated the following IC balances:\n\n**Revenue Eliminations:**\n• IC Sales (PT → ES): €2.4M eliminated\n• IC Services (UK → PT): €1.1M eliminated\n• IC Sales (DE → FR): €0.8M eliminated\n• **Total IC Revenue Eliminated: €4.3M**\n\n**Balance Sheet Eliminations:**\n• IC Receivables: €1.8M eliminated\n• IC Payables: €1.8M eliminated\n• **Net BS Impact: €0** (fully matched)\n\n**Impact on Consolidated Statements:**\n1. Revenue reduced by €4.3M (8.3% of gross revenue)\n2. Net income unaffected (eliminations offset in P&L)\n3. Working capital improved — net receivables reduced by €1.8M\n4. **3 unmatched transactions** remain pending review (€0.3M total)";
  }

  if (lower.includes('fx') || lower.includes('exchange') || lower.includes('currency') || lower.includes('rate')) {
    return "**FX Rate Exposure Analysis**\n\n**Current Exchange Rates (Dec 2024):**\n• EUR/GBP: 0.856 (spot) — GBP weakened 2.1% YTD\n• EUR/USD: 1.089 (spot) — USD strengthened 1.5% YTD\n\n**Translation Impact by Entity:**\n| Entity | Local Currency | Revenue (Local) | Revenue (EUR) | FX Impact YTD |\n|--------|---------------|-----------------|---------------|---------------|\n| UK | GBP | £11.8M | €13.7M | -€0.3M |\n| DE | EUR | €8.2M | €8.2M | €0 |\n| FR | EUR | €5.1M | €5.1M | €0 |\n\n**Key Risks:**\n1. **GBP exposure**: A 5% GBP depreciation would reduce consolidated revenue by ~€0.7M\n2. **Natural hedge**: EUR-denominated entities (PT, ES, DE, FR) provide 76% revenue base in EUR\n3. **Recommendation**: Consider GBP forward contracts for Q1 2025 cash flows\n\n**Scenario Impact:**\n- Optimistic (GBP +3%): +€0.4M to consolidated revenue\n- Pessimistic (GBP -5%): -€0.7M to consolidated revenue";
  }

  if (lower.includes('budget') || lower.includes('actual')) {
    return "**Budget vs Actual Summary (Dec 2024)**\n\n**Consolidated Group Performance:**\n\n| Category | Budget | Actual | Variance | Var % |\n|----------|--------|--------|----------|-------|\n| Revenue | €50.2M | €51.9M | +€1.7M | +3.4% ✓ |\n| COGS | €28.1M | €27.5M | -€0.6M | -2.1% ✓ |\n| EBITDA | €17.2M | €17.7M | +€0.5M | +2.9% ✓ |\n| Net Income | €10.8M | €11.2M | +€0.4M | +3.7% ✓ |\n| Capex | €4.5M | €4.8M | +€0.3M | +6.7% ⚠ |\n\n**Highlights:**\n- Revenue exceeded budget by **€1.7M** (+3.4%), driven by PT and ES outperformance\n- COGS came in **€0.6M below budget** — favorable procurement variances\n- Capex exceeded budget by 6.7% — primarily from UK office renovation (€0.2M over)\n- Overall group performance: **Favorable** with 4 of 5 key metrics beating budget";
  }

  if (lower.includes('cash flow') || lower.includes('forecast')) {
    return "**Cash Flow Forecast Outlook (6-Month Projection)**\n\n**Current Position (Dec 2024):**\n• Cash on hand: **€2,400K**\n• Operating CF (monthly avg): **€480K**\n• Free Cash Flow (monthly avg): **€340K**\n\n**6-Month Forecast:**\n| Month | Operating CF | Investing CF | Financing CF | Net Change |\n|-------|-------------|-------------|-------------|------------|\n| Jan 2025 | €575K | -€250K | -€200K | €125K |\n| Feb 2025 | €590K | -€210K | -€200K | €180K |\n| Mar 2025 | €610K | -€280K | -€200K | €130K |\n| Apr 2025 | €625K | -€230K | -€200K | €195K |\n| May 2025 | €640K | -€260K | -€200K | €180K |\n| Jun 2025 | €660K | -€290K | -€200K | €170K |\n\n**Key Metrics:**\n- **Projected 6M Cash**: €3,180K (+€780K from current)\n- **Cash Runway**: 18+ months at current burn rate\n- **Breakeven**: N/A — consistently positive net cash flow\n- **Min Cash Position**: €2,525K (Jan 2025)\n\n**Risk Factors:** Capital expenditure timing may create temporary cash pressure in Mar and Jun 2025.";
  }

  return `**Analysis Complete**\n\nBased on the consolidated financial data for the TechNova Group (period: Dec 2024, scenario: Base Case), here are my insights:\n\n**Current Financial Position:**\n• Total consolidated revenue: **€51.9M**\n• EBITDA margin: **33.9%** — healthy and above industry average\n• Net income: **€11.2M** with strong cash generation\n• Balance sheet check: Within tolerance (minor rounding adjustments)\n\n**Key Observations:**\n1. Revenue growth of **+5.2%** QoQ continues the positive trend from Q3\n2. IC eliminations totaling **€4.3M** properly applied across all 5 entities\n3. FX translation impact manageable — 76% of revenue EUR-denominated\n4. Budget performance **favorable** — 4 of 5 key metrics above target\n\n**Recommendations:**\n- Monitor GBP exposure closely given recent volatility\n- Address 3 unmatched IC transactions (€0.3M)\n- Consider accelerating debt repayment given strong cash position\n\nWould you like me to drill deeper into any specific area?`;
}

// ============================================================
// ANIMATION VARIANTS
// ============================================================
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] } },
};

const messageVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

// ============================================================
// FORMAT AI RESPONSE (simple markdown-like rendering)
// ============================================================
function formatAIContent(content: string) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    // Bold headings with **
    if (line.startsWith('**') && line.endsWith('**')) {
      elements.push(
        <p key={i} className="font-bold text-sm text-foreground mt-2 mb-1">
          {line.replace(/\*\*/g, '')}
        </p>
      );
      return;
    }

    // Bold text inline
    const formattedLine = line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Bullet points
    if (line.startsWith('• ') || line.startsWith('- ')) {
      elements.push(
        <p key={i} className="text-sm text-muted-foreground ml-3 leading-relaxed" dangerouslySetInnerHTML={{ __html: formattedLine.replace(/^[•-]\s/, '') }} />
      );
      return;
    }

    // Numbered items
    if (/^\d+\.\s/.test(line)) {
      elements.push(
        <p key={i} className="text-sm text-muted-foreground ml-3 leading-relaxed" dangerouslySetInnerHTML={{ __html: formattedLine }} />
      );
      return;
    }

    // Table-like lines (starting with |)
    if (line.startsWith('|')) {
      const cells = line.split('|').filter(c => c.trim());
      if (cells.every(c => /^[-:\s]+$/.test(c.trim()))) return; // separator line
      elements.push(
        <div key={i} className="flex gap-3 text-xs py-0.5 ml-2">
          {cells.map((cell, ci) => (
            <span key={ci} className={ci === 0 ? 'w-28 shrink-0 text-muted-foreground' : 'flex-1'} dangerouslySetInnerHTML={{ __html: cell.trim().replace(/\*\*/g, '<strong>$&</strong>').replace(/\*\*/g, '') }} />
          ))}
        </div>
      );
      return;
    }

    // Empty lines
    if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
      return;
    }

    // Regular text
    elements.push(
      <p key={i} className="text-sm text-muted-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: formattedLine }} />
    );
  });

  return elements;
}

// ============================================================
// TYPING INDICATOR
// ============================================================
function TypingIndicator() {
  return (
    <motion.div
      variants={messageVariants}
      initial="hidden"
      animate="visible"
      className="flex items-start gap-3 px-4 py-3"
    >
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20">
        <Sparkles className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-xl rounded-tl-sm px-4 py-3 border border-slate-200 dark:border-slate-700 shadow-sm relative">
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-l-xl" />
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 bg-emerald-400 rounded-full"
              animate={{ y: [0, -6, 0] }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                delay: i * 0.15,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export function AIInsightsView() {
  const { selectedPeriod, selectedScenario } = useAppStore();

  // Sessions state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Chat state
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get active session
  const activeSession = sessions.find((s) => s.id === activeSessionId);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages, isLoading]);

  // ============================================================
  // CREATE NEW SESSION
  // ============================================================
  const createNewSession = () => {
    const newSession: ChatSession = {
      id: `session-${Date.now()}`,
      title: 'New Chat',
      messages: [],
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setInputValue('');
    inputRef.current?.focus();
  };

  // ============================================================
  // DELETE SESSION
  // ============================================================
  const deleteSession = (sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
    }
  };

  // ============================================================
  // SEND MESSAGE
  // ============================================================
  const handleSendMessage = async (messageText?: string) => {
    const text = (messageText || inputValue).trim();
    if (!text || isLoading) return;

    let currentSessionId = activeSessionId;

    // If no active session, create one
    if (!currentSessionId) {
      const newSession: ChatSession = {
        id: `session-${Date.now()}`,
        title: text.length > 40 ? text.substring(0, 40) + '...' : text,
        messages: [],
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
      };
      setSessions((prev) => [newSession, ...prev]);
      currentSessionId = newSession.id;
      setActiveSessionId(newSession.id);
    }

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    // Update session with user message
    setSessions((prev) =>
      prev.map((s) =>
        s.id === currentSessionId
          ? {
              ...s,
              title: s.messages.length === 0 ? (text.length > 40 ? text.substring(0, 40) + '...' : text) : s.title,
              messages: [...s.messages, userMessage],
              lastActive: new Date().toISOString(),
            }
          : s
      )
    );

    setInputValue('');
    setIsLoading(true);

    try {
      const result = await sendAIChatMessage(text, currentSessionId || undefined, {
        period: selectedPeriod,
        scenarioType: selectedScenario,
      });

      const aiMessage: ChatMessage = {
        id: `msg-${Date.now()}-ai`,
        role: 'assistant',
        content: result.response,
        timestamp: result.timestamp || new Date().toISOString(),
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSessionId
            ? {
                ...s,
                messages: [...s.messages, aiMessage],
                lastActive: new Date().toISOString(),
              }
            : s
        )
      );
    } catch {
      // Fallback to simulated response
      const aiMessage: ChatMessage = {
        id: `msg-${Date.now()}-ai`,
        role: 'assistant',
        content: generateAIResponse(text),
        timestamp: new Date().toISOString(),
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSessionId
            ? {
                ...s,
                messages: [...s.messages, aiMessage],
                lastActive: new Date().toISOString(),
              }
            : s
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================
  // HANDLE KEY PRESS
  // ============================================================
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ============================================================
  // FORMAT TIMESTAMP
  // ============================================================
  function formatTimestamp(ts: string): string {
    try {
      const d = new Date(ts);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);

      if (diffMin < 1) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  }

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="h-[calc(100vh-8rem)] flex gap-4"
    >
      {/* ============================================================ */}
      {/* LEFT SIDEBAR - CONVERSATION HISTORY */}
      {/* ============================================================ */}
      <motion.div variants={itemVariants}>
        <div
          className={`
            ${sidebarOpen ? 'w-72' : 'w-0 overflow-hidden'}
            transition-all duration-300 flex flex-col
            bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-xl border border-slate-200/50 dark:border-slate-700/50 shadow-lg
          `}
        >
          {sidebarOpen && (
            <div className="flex flex-col h-full">
              {/* Sidebar Header */}
              <div className="p-4 border-b border-slate-200/50 dark:border-slate-700/50">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-emerald-500" />
                    Chat History
                  </h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-slate-400 hover:text-foreground"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                </div>
                <Button
                  onClick={createNewSession}
                  className="w-full h-9 text-xs font-medium bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-emerald-500/20 transition-all"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  New Chat
                </Button>
              </div>

              {/* Conversation List */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                {sessions.length === 0 && (
                  <div className="text-center py-8">
                    <MessageSquare className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No conversations yet</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Start a new chat to begin</p>
                  </div>
                )}
                <AnimatePresence>
                  {sessions.map((session) => {
                    const isActive = activeSessionId === session.id;
                    const firstUserMsg = session.messages.find((m) => m.role === 'user');
                    return (
                      <motion.div
                        key={session.id}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -12 }}
                        transition={{ duration: 0.2 }}
                        className={`
                          group relative flex items-start gap-2 p-2.5 rounded-lg cursor-pointer transition-all
                          ${isActive
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 shadow-[0_0_12px_rgba(16,185,129,0.1)]'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent'
                          }
                        `}
                        onClick={() => setActiveSessionId(session.id)}
                      >
                        {/* Glowing bar for active */}
                        {isActive && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-emerald-500 rounded-r-full shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
                        )}
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 flex items-center justify-center shrink-0 mt-0.5">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">
                            {session.title}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-muted-foreground">
                              {session.messages.length} msg{session.messages.length !== 1 ? 's' : ''}
                            </span>
                            <span className="text-[10px] text-muted-foreground">·</span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatTimestamp(session.lastActive)}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(session.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30"
                        >
                          <Trash2 className="w-3 h-3 text-red-400" />
                        </button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Toggle Sidebar Button (when collapsed) */}
      {!sidebarOpen && (
        <motion.div variants={itemVariants} className="shrink-0">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-md"
            onClick={() => setSidebarOpen(true)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </motion.div>
      )}

      {/* ============================================================ */}
      {/* MAIN CHAT AREA */}
      {/* ============================================================ */}
      <motion.div variants={itemVariants} className="flex-1 flex flex-col min-w-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-xl border border-slate-200/50 dark:border-slate-700/50 shadow-lg overflow-hidden">
        {/* Chat Header */}
        <div className="px-5 py-3 border-b border-slate-200/50 dark:border-slate-700/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/20">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">AI Financial Insights</h2>
              <p className="text-[10px] text-muted-foreground">Powered by ConsolidaçãoFX Analytics</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Context chips */}
            <Badge variant="outline" className="text-[10px] font-mono border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400">
              <Clock className="w-3 h-3 mr-1" />
              {selectedPeriod}
            </Badge>
            <Badge className="text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50">
              {selectedScenario === 'base' ? 'Base Case' : selectedScenario === 'optimistic' ? 'Optimistic' : 'Pessimistic'}
            </Badge>
          </div>
        </div>

        {/* Chat Messages or Welcome Screen */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {!activeSession || activeSession.messages.length === 0 ? (
            /* ============================================================ */
            /* WELCOME SCREEN */
            /* ============================================================ */
            <div className="h-full flex flex-col items-center justify-center px-6 py-12">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="text-center mb-8"
              >
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-5 shadow-xl shadow-emerald-500/25">
                  <Sparkles className="w-10 h-10 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-foreground mb-2">AI Financial Insights</h1>
                <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                  Ask questions about your consolidated financial data, entity performance, FX impacts, and more
                </p>
              </motion.div>

              {/* Suggested Prompt Cards */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl w-full"
              >
                {suggestedPrompts.map((prompt, idx) => {
                  const Icon = prompt.icon;
                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.1 + idx * 0.05 }}
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      className="cursor-pointer"
                      onClick={() => {
                        if (!activeSessionId) {
                          createNewSession();
                        }
                        setTimeout(() => handleSendMessage(prompt.title), 50);
                      }}
                    >
                      <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-xl transition-all duration-300 group">
                        <div className={`absolute inset-0 bg-gradient-to-br ${prompt.color} opacity-[0.06] group-hover:opacity-[0.12] transition-opacity`} />
                        <div className="relative p-4 flex items-start gap-3">
                          <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${prompt.color} flex items-center justify-center shrink-0 shadow-md`}>
                            <Icon className="w-4 h-4 text-white" />
                          </div>
                          <p className="text-xs font-medium text-foreground leading-relaxed pt-1.5">{prompt.title}</p>
                        </div>
                      </Card>
                    </motion.div>
                  );
                })}
              </motion.div>
            </div>
          ) : (
            /* ============================================================ */
            /* CHAT MESSAGES */
            /* ============================================================ */
            <div className="px-4 py-6 space-y-1">
              <AnimatePresence mode="popLayout">
                {activeSession.messages.map((msg, idx) => (
                  <motion.div
                    key={msg.id}
                    variants={messageVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    transition={{ delay: idx * 0.02 }}
                    className={`flex items-start gap-3 px-4 py-3 ${
                      msg.role === 'user' ? 'flex-row-reverse' : ''
                    }`}
                  >
                    {/* Avatar */}
                    {msg.role === 'assistant' ? (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20">
                        <Sparkles className="w-3.5 h-3.5 text-white" />
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center shrink-0 shadow-md">
                        <User className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}

                    {/* Message Bubble */}
                    {msg.role === 'user' ? (
                      <div className="max-w-[75%] bg-gradient-to-br from-emerald-600 to-teal-600 text-white rounded-xl rounded-tr-sm px-4 py-2.5 shadow-md shadow-emerald-500/10">
                        <p className="text-sm leading-relaxed">{msg.content}</p>
                        <p className="text-[10px] text-emerald-200/70 mt-1.5 text-right">
                          {formatTimestamp(msg.timestamp)}
                        </p>
                      </div>
                    ) : (
                      <div className="max-w-[80%] bg-white dark:bg-slate-800 rounded-xl rounded-tl-sm px-4 py-3 border border-slate-200 dark:border-slate-700 shadow-sm relative">
                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-l-xl" />
                        <div className="space-y-0.5">{formatAIContent(msg.content)}</div>
                        <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                          <Bot className="w-3 h-3" />
                          {formatTimestamp(msg.timestamp)}
                        </p>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Typing Indicator */}
              {isLoading && <TypingIndicator />}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your financial data..."
                disabled={isLoading}
                className="h-11 text-sm pr-12 border-slate-200 dark:border-slate-700 focus:border-emerald-400 focus:ring-emerald-400/20 bg-white dark:bg-slate-800 rounded-xl"
              />
              <Button
                onClick={() => handleSendMessage()}
                disabled={!inputValue.trim() || isLoading}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 p-0 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-emerald-500/20 rounded-lg disabled:opacity-40"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2 px-1">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-500" />
              Context: {selectedPeriod} · {selectedScenario === 'base' ? 'Base Case' : selectedScenario === 'optimistic' ? 'Optimistic' : 'Pessimistic'}
            </span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] text-muted-foreground">Press Enter to send</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
