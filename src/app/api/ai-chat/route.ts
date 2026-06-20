import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';

// ============================================================
// AI FINANCIAL INSIGHTS CHAT API
// Uses z-ai-web-dev-sdk (backend only) for LLM-powered insights
// ============================================================

// Zod validation schema
const chatRequestSchema = z.object({
  message: z.string().min(1, 'Message is required').max(2000, 'Message too long'),
  sessionId: z.string().optional(),
  context: z.object({
    period: z.string().optional(),
    scenarioType: z.string().optional(),
    entityCodes: z.array(z.string()).optional(),
  }).optional(),
});

// Chat sessions are persisted to the `ChatSession` table (last 20 messages per
// session) so conversations survive restarts and work across serverless
// instances — a module-level Map does neither.
type ChatMessage = { role: 'user' | 'assistant'; content: string };
const MAX_MESSAGES = 20;

// Generate a unique session ID
function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Clean up old sessions (inactive for more than 1 hour)
async function cleanupOldSessions(): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  await db.chatSession.deleteMany({ where: { lastActive: { lt: oneHourAgo } } });
}

// Load a session's message history, or null if the session doesn't exist.
async function loadSessionMessages(sessionId: string): Promise<ChatMessage[] | null> {
  const row = await db.chatSession.findUnique({ where: { id: sessionId } });
  if (!row) return null;
  try {
    return JSON.parse(row.messages) as ChatMessage[];
  } catch {
    return [];
  }
}

// Persist a session's message history (trimmed to the last MAX_MESSAGES), bumping lastActive.
async function saveSessionMessages(sessionId: string, messages: ChatMessage[]): Promise<void> {
  const value = JSON.stringify(messages.slice(-MAX_MESSAGES));
  const now = new Date();
  await db.chatSession.upsert({
    where: { id: sessionId },
    create: { id: sessionId, messages: value, createdAt: now, lastActive: now },
    update: { messages: value, lastActive: now },
  });
}

/**
 * Fetch real financial context from the database to enrich AI responses
 */
async function fetchFinancialContext(context?: {
  period?: string;
  scenarioType?: string;
  entityCodes?: string[];
}): Promise<string> {
  try {
    const period = context?.period || '2024-12';
    const scenarioType = context?.scenarioType || 'base';
    const entityCodes = context?.entityCodes;
    const periodDate = new Date(period + '-01');

    const parts: string[] = [];

    // Fetch entities
    const entityFilter: Record<string, unknown> = { isActive: true };
    if (entityCodes && entityCodes.length > 0) {
      entityFilter.code = { in: entityCodes };
    }
    const entities = await db.entity.findMany({ where: entityFilter });

    if (entities.length > 0) {
      parts.push(`\n=== ENTITIES (${entities.length}) ===`);
      for (const entity of entities) {
        parts.push(
          `- ${entity.code}: ${entity.legalName} (${entity.countryCode}, ` +
          `Currency: ${entity.localCurrency}, Method: ${entity.consolidationMethod}, ` +
          `Ownership: ${(entity.ownershipPercentage * 100).toFixed(0)}%)`
        );
      }
    }

    // Fetch trial balances for the period
    const entityIds = entities.map((e) => e.id);
    if (entityIds.length > 0) {
      const periodType = scenarioType === 'base' ? 'actual' : 'forecast';
      let trialBalances = await db.trialBalance.findMany({
        where: {
          entityId: { in: entityIds },
          period: periodDate,
          periodType,
        },
        include: {
          entity: { select: { code: true, legalName: true } },
          groupCOA: { select: { code: true, name: true, accountType: true, statementType: true } },
        },
        take: 100,
      });

      // Fallback: try any period type
      if (trialBalances.length === 0) {
        trialBalances = await db.trialBalance.findMany({
          where: {
            entityId: { in: entityIds },
            period: periodDate,
          },
          include: {
            entity: { select: { code: true, legalName: true } },
            groupCOA: { select: { code: true, name: true, accountType: true, statementType: true } },
          },
          take: 100,
        });
      }

      if (trialBalances.length > 0) {
        // Aggregate by entity and account type
        const entitySummary = new Map<string, { revenue: number; expenses: number; assets: number; liabilities: number; equity: number }>();

        for (const tb of trialBalances) {
          const key = tb.entity.code;
          if (!entitySummary.has(key)) {
            entitySummary.set(key, { revenue: 0, expenses: 0, assets: 0, liabilities: 0, equity: 0 });
          }
          const summary = entitySummary.get(key)!;
          const amount = tb.amountEUR;

          if (tb.groupCOA?.accountType === 'revenue') summary.revenue += amount;
          else if (tb.groupCOA?.accountType === 'expense') summary.expenses += amount;
          else if (tb.groupCOA?.accountType === 'asset') summary.assets += amount;
          else if (tb.groupCOA?.accountType === 'liability') summary.liabilities += amount;
          else if (tb.groupCOA?.accountType === 'equity') summary.equity += amount;
        }

        parts.push(`\n=== FINANCIAL DATA (Period: ${period}, Scenario: ${scenarioType}) ===`);
        let totalRevenue = 0, totalExpenses = 0, totalAssets = 0, totalLiabilities = 0, totalEquity = 0;

        for (const [entityCode, summary] of entitySummary.entries()) {
          const netIncome = summary.revenue + summary.expenses; // expenses are negative
          parts.push(
            `- ${entityCode}: Revenue=€${summary.revenue.toLocaleString()}, ` +
            `Expenses=€${Math.abs(summary.expenses).toLocaleString()}, ` +
            `Net Income=€${netIncome.toLocaleString()}, ` +
            `Assets=€${summary.assets.toLocaleString()}, ` +
            `Liabilities=€${summary.liabilities.toLocaleString()}, ` +
            `Equity=€${summary.equity.toLocaleString()}`
          );
          totalRevenue += summary.revenue;
          totalExpenses += summary.expenses;
          totalAssets += summary.assets;
          totalLiabilities += summary.liabilities;
          totalEquity += summary.equity;
        }

        const totalNetIncome = totalRevenue + totalExpenses;
        const ebitdaMargin = totalRevenue > 0 ? ((totalRevenue + totalExpenses) / totalRevenue * 100).toFixed(1) : 'N/A';
        const roe = totalEquity !== 0 ? (totalNetIncome / totalEquity * 100).toFixed(1) : 'N/A';
        const leverage = totalNetIncome !== 0 ? (totalLiabilities / Math.abs(totalNetIncome)).toFixed(2) : 'N/A';

        parts.push(`\n=== GROUP CONSOLIDATED SUMMARY ===`);
        parts.push(`Total Revenue: €${totalRevenue.toLocaleString()}`);
        parts.push(`Total Expenses: €${Math.abs(totalExpenses).toLocaleString()}`);
        parts.push(`Net Income: €${totalNetIncome.toLocaleString()}`);
        parts.push(`Total Assets: €${totalAssets.toLocaleString()}`);
        parts.push(`Total Liabilities: €${totalLiabilities.toLocaleString()}`);
        parts.push(`Total Equity: €${totalEquity.toLocaleString()}`);
        parts.push(`EBITDA Margin: ${ebitdaMargin}%`);
        parts.push(`ROE: ${roe}%`);
        parts.push(`Leverage: ${leverage}x`);
      } else {
        parts.push(`\nNo trial balance data found for period ${period}.`);
      }
    }

    // Fetch recent consolidation runs
    const recentRuns = await db.consolidationRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    if (recentRuns.length > 0) {
      parts.push(`\n=== RECENT CONSOLIDATION RUNS ===`);
      for (const run of recentRuns) {
        const runPeriod = run.period instanceof Date ? run.period.toISOString().substring(0, 7) : String(run.period).substring(0, 7);
        parts.push(
          `- Period: ${runPeriod}, Scenario: ${run.scenarioType}, ` +
          `Revenue: €${(run.totalRevenue || 0).toLocaleString()}, ` +
          `EBITDA: €${(run.totalEBITDA || 0).toLocaleString()}, ` +
          `Net Income: €${(run.totalNetIncome || 0).toLocaleString()}, ` +
          `Eliminations: ${run.eliminationsApplied}`
        );
      }
    }

    // Fetch exchange rates
    const latestRates = await db.exchangeRate.findMany({
      where: { rateType: 'closing' },
      orderBy: { rateDate: 'desc' },
      take: 10,
      distinct: ['currency'],
    });

    if (latestRates.length > 0) {
      parts.push(`\n=== EXCHANGE RATES (Latest Closing) ===`);
      for (const rate of latestRates) {
        const date = rate.rateDate instanceof Date ? rate.rateDate.toISOString().split('T')[0] : String(rate.rateDate).split('T')[0];
        parts.push(`- ${rate.currency}/EUR: ${rate.rate.toFixed(4)} (as of ${date}, Source: ${rate.source})`);
      }
    }

    // Fetch IC transactions
    const icCount = await db.intercompanyTransaction.count({
      where: { isEliminated: false },
    });
    const icEliminated = await db.intercompanyTransaction.count({
      where: { isEliminated: true },
    });
    parts.push(`\n=== IC TRANSACTIONS ===`);
    parts.push(`Uneliminated: ${icCount}, Eliminated: ${icEliminated}`);

    return parts.join('\n');
  } catch (error) {
    console.error('Error fetching financial context:', error);
    return '\n[Note: Unable to fetch live financial data from database. Using general knowledge only.]';
  }
}

/**
 * Build system prompt for the financial consolidation expert
 */
function buildSystemPrompt(financialContext: string): string {
  return `You are a financial consolidation expert AI assistant for ConsolidaçãoFX, a multi-company financial consolidation platform. You have deep expertise in:

1. **Revenue Trends & Profitability**: Analyzing revenue patterns, growth rates, gross margins, and profitability drivers across entities
2. **Entity-Level Comparisons**: Comparing financial performance between subsidiaries, identifying outliers and best performers
3. **Consolidation Results & IC Eliminations**: Explaining intercompany elimination impacts, consolidation adjustments, and how they affect group-level financials
4. **FX Rate Impacts**: Analyzing how currency fluctuations affect consolidated results, translation vs. transaction exposure
5. **Budget Variances**: Identifying and explaining budget vs. actual variances, both favorable and unfavorable
6. **Cash Flow Forecasts**: Assessing cash flow adequacy, operating/investing/financing cash flow trends, and liquidity positions
7. **Financial Health Assessment**: Evaluating leverage ratios, liquidity, ROE, ROA, interest coverage, and overall financial health

You have access to real financial data from the ConsolidaçãoFX database:

${financialContext}

Guidelines:
- Always use the real financial data provided above when answering questions
- Provide specific numbers, percentages, and entity references when possible
- If data is limited or unavailable, clearly state that and provide general guidance
- Format numbers with currency symbols (€) and use proper thousands separators
- When comparing entities, present data in a structured way
- Highlight key risks, trends, and opportunities
- Be concise but thorough — aim for actionable insights
- If asked about something outside financial consolidation, politely redirect to financial topics
- Use bullet points and clear structure for complex analyses`;
}

/**
 * Retry with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`AI Chat attempt ${attempt}/${maxAttempts} failed:`, lastError.message);

      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('All retry attempts failed');
}

/**
 * POST /api/ai-chat
 * Send a message to the AI financial insights chatbot
 */
export async function POST(request: NextRequest) {
  try {
    // Cleanup old sessions periodically
    cleanupOldSessions();

    const body = await request.json();
    const validated = chatRequestSchema.parse(body);

    const { message, sessionId, context } = validated;

    // Get or create session (persisted in the DB).
    const currentSessionId = sessionId || generateSessionId();
    const messages: ChatMessage[] = (await loadSessionMessages(currentSessionId)) ?? [];

    // Add user message to history, trimmed to the last MAX_MESSAGES.
    messages.push({ role: 'user', content: message });
    if (messages.length > MAX_MESSAGES) {
      messages.splice(0, messages.length - MAX_MESSAGES);
    }

    // Fetch financial context from database
    const financialContext = await fetchFinancialContext(context);

    // Build messages for the AI
    const systemPrompt = buildSystemPrompt(financialContext);
    const aiMessages: Array<{ role: 'assistant' | 'user'; content: string }> = [
      { role: 'assistant', content: systemPrompt },
      ...messages,
    ];

    // Call z-ai-web-dev-sdk with retry logic
    let aiResponse: string;

    try {
      aiResponse = await retryWithBackoff(async () => {
        const ZAI = (await import('z-ai-web-dev-sdk')).default;
        const zai = await ZAI.create();
        const completion = await zai.chat.completions.create({
          messages: aiMessages,
          thinking: { type: 'disabled' },
        });
        const response = completion.choices[0]?.message?.content;
        if (!response) {
          throw new Error('Empty response from AI model');
        }
        return response;
      });
    } catch (aiError) {
      console.error('AI Chat error after retries:', aiError);

      // Fallback: provide a structured response based on the financial context we fetched
      aiResponse = generateFallbackResponse(message, financialContext);
    }

    // Add assistant response to history and persist (trimmed) the updated session.
    messages.push({ role: 'assistant', content: aiResponse });
    await saveSessionMessages(currentSessionId, messages);

    return NextResponse.json({
      response: aiResponse,
      sessionId: currentSessionId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error in AI chat:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process chat message' },
      { status: 500 }
    );
  }
}

/**
 * Generate a fallback response when the AI SDK is unavailable
 */
function generateFallbackResponse(message: string, financialContext: string): string {
  const msg = message.toLowerCase();

  if (msg.includes('revenue') || msg.includes('turnover') || msg.includes('sales')) {
    const revenueMatch = financialContext.match(/Total Revenue: €([\d,]+)/);
    if (revenueMatch) {
      return `Based on the current financial data, the group's total consolidated revenue is €${revenueMatch[1]}. ` +
        `This represents the sum of all subsidiary revenues after intercompany eliminations. ` +
        `For a more detailed breakdown by entity or period-over-period analysis, please review the Dashboard and Trend Analysis views.`;
    }
  }

  if (msg.includes('profit') || msg.includes('margin') || msg.includes('ebitda')) {
    const marginMatch = financialContext.match(/EBITDA Margin: ([\d.]+)%/);
    if (marginMatch) {
      return `The current EBITDA margin stands at ${marginMatch[1]}%. ` +
        `This indicates the operational efficiency of the group after accounting for cost of goods sold and operating expenses. ` +
        `A margin above 25% is generally considered strong for technology companies. ` +
        `For detailed margin analysis by entity, check the Entities view with the comparison tool.`;
    }
  }

  if (msg.includes('debt') || msg.includes('leverage') || msg.includes('borrow')) {
    const leverageMatch = financialContext.match(/Leverage: ([\d.]+)x/);
    if (leverageMatch) {
      return `The group's leverage ratio is currently ${leverageMatch[1]}x (Net Debt / EBITDA). ` +
        `A leverage ratio below 3x is typically considered healthy. ` +
        `The net debt position reflects short-term and long-term debt minus cash holdings. ` +
        `For entity-level debt analysis, refer to the Consolidation view.`;
    }
  }

  if (msg.includes('cash') || msg.includes('liquidity') || msg.includes('flow')) {
    return `For cash flow analysis, I recommend reviewing the Cash Flow Forecast view which provides ` +
      `operating, investing, and financing cash flow projections with confidence intervals. ` +
      `The group monitors cash positions across all subsidiaries with particular attention to ` +
      `the UK entity (GBP currency) which requires FX conversion considerations.`;
  }

  if (msg.includes('fx') || msg.includes('exchange') || msg.includes('currency') || msg.includes('rate')) {
    const rateMatches = financialContext.match(/- (\w+\/EUR): ([\d.]+)/g);
    if (rateMatches && rateMatches.length > 0) {
      return `Current exchange rates against EUR:\n${rateMatches.join('\n')}\n\n` +
        `FX rate changes directly impact the consolidated financial statements through: ` +
        `(1) Translation of foreign subsidiary results, and (2) Transaction exposure on intercompany dealings. ` +
        `The UK entity (GBP) is the primary source of FX impact. For detailed rate trends, check the FX Rates view.`;
    }
  }

  if (msg.includes('entity') || msg.includes('subsidiary') || msg.includes('company') || msg.includes('compare')) {
    return `The group consists of multiple subsidiaries across different countries and currencies. ` +
      `Each entity uses a different consolidation method (full, proportional, equity) based on ownership percentage. ` +
      `For detailed entity-level comparison, use the Entity Comparison Tool in the Entities view, ` +
      `which provides side-by-side income statement, balance sheet, and key ratio analysis.`;
  }

  if (msg.includes('elimination') || msg.includes('intercompany') || msg.includes('ic')) {
    const icMatches = financialContext.match(/Uneliminated: (\d+), Eliminated: (\d+)/);
    if (icMatches) {
      return `Intercompany transaction status: ${icMatches[1]} uneliminated, ${icMatches[2]} eliminated. ` +
        `IC eliminations are crucial for accurate consolidated financial statements, removing: ` +
        `(1) IC revenue and expenses, (2) IC receivables and payables, and (3) IC investment and equity. ` +
        `Use the IC Transactions view to review and process eliminations.`;
    }
  }

  if (msg.includes('budget') || msg.includes('variance') || msg.includes('forecast')) {
    return `For budget vs actual analysis, the Budget vs Actual view provides detailed variance analysis ` +
      `at the account level for each entity. Key variance categories include revenue shortfalls, ` +
      `cost overruns, and timing differences. The Variance Analysis view also shows ` +
      `variance vs budget and vs forecast with trend indicators.`;
  }

  if (msg.includes('health') || msg.includes('score') || msg.includes('risk') || msg.includes('assess')) {
    return `The Financial Health Scorecard on the Dashboard provides a comprehensive assessment with: ` +
      `(1) Revenue Growth indicator, (2) EBITDA Margin, (3) Leverage Ratio, (4) Liquidity Ratio, ` +
      `(5) Return on Equity, and (6) Interest Coverage. Each metric has traffic light indicators ` +
      `(Green=Strong, Amber=Moderate, Red=At Risk) with an overall group health score out of 100.`;
  }

  // Default response
  return `I'm your ConsolidaçãoFX financial consolidation assistant. I can help you with:\n\n` +
    `- **Revenue trends & profitability** analysis\n` +
    `- **Entity-level comparisons** across subsidiaries\n` +
    `- **Consolidation results** and IC elimination impacts\n` +
    `- **FX rate impacts** on group financials\n` +
    `- **Budget variances** and forecast analysis\n` +
    `- **Cash flow forecasts** and liquidity assessment\n` +
    `- **Financial health** scoring and risk assessment\n\n` +
    `Please ask a specific question about any of these topics, and I'll provide data-driven insights ` +
    `based on your current financial data.`;
}
