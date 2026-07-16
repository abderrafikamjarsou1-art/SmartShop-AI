import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError, NotFoundError } from "@/lib/errors";
import { runWithTools, summarize, buildSystemPrompt, type ChatTurn } from "@/lib/ai/openai";
import type { TenantContext } from "@/lib/tenant";

/**
 * AI service — conversations, rate limits, cost control, insights.
 *
 * COST CONTROL DESIGN:
 *  - Context = system prompt + rolling summary + last KEEP_TURNS messages.
 *  - When a conversation passes SUMMARIZE_AFTER messages, older turns are
 *    folded into conversation.summary (one cheap call), so context size
 *    is bounded no matter how long the chat runs.
 *  - Tool results are truncated in the registry; output tokens are capped
 *    in the runner.
 */

const RATE_LIMIT = 30;                 // user messages / hour / user / business
const KEEP_TURNS = 12;                 // verbatim recent messages in context
const SUMMARIZE_AFTER = 20;            // fold older turns into the summary

export class RateLimitError extends ApiError {
  constructor() {
    super(`You've reached the limit of ${RATE_LIMIT} AI messages per hour. Try again soon.`, 429, "RATE_LIMITED", true);
  }
}

export const aiService = {
  // ---------- conversations ----------
  async listConversations(ctx: TenantContext) {
    return prisma.aiConversation.findMany({
      where: { businessId: ctx.businessId, userId: ctx.user.id },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { id: true, title: true, updatedAt: true },
    });
  },

  async getConversation(ctx: TenantContext, id: string) {
    const conversation = await prisma.aiConversation.findFirst({
      where: { id, businessId: ctx.businessId, userId: ctx.user.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!conversation) throw new NotFoundError("Conversation");
    return conversation;
  },

  async createConversation(ctx: TenantContext) {
    return prisma.aiConversation.create({
      data: { businessId: ctx.businessId, userId: ctx.user.id },
    });
  },

  async deleteConversation(ctx: TenantContext, id: string) {
    await this.getConversation(ctx, id); // tenant + owner check
    await prisma.aiConversation.delete({ where: { id } });
  },

  // ---------- rate limiting ----------
  async assertWithinRateLimit(ctx: TenantContext) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const count = await prisma.aiMessage.count({
      where: {
        role: "USER",
        createdAt: { gte: oneHourAgo },
        conversation: { businessId: ctx.businessId, userId: ctx.user.id },
      },
    });
    if (count >= RATE_LIMIT) throw new RateLimitError();
  },

  // ---------- the chat turn ----------
  async runTurn(
    ctx: TenantContext,
    conversationId: string,
    userMessage: string,
    onDelta: (text: string) => void
  ) {
    await this.assertWithinRateLimit(ctx);
    const conversation = await this.getConversation(ctx, conversationId);

    await prisma.aiMessage.create({
      data: { conversationId, role: "USER", content: userMessage },
    });

    // Build bounded context: summary of the old + last N verbatim
    const recent = conversation.messages.slice(-KEEP_TURNS);
    const turns: ChatTurn[] = [
      ...(conversation.summary
        ? [{ role: "user" as const, content: `(Context summary of earlier conversation: ${conversation.summary})` }]
        : []),
      ...recent.map((m) => ({ role: m.role === "USER" ? ("user" as const) : ("assistant" as const), content: m.content })),
      { role: "user" as const, content: userMessage },
    ];

    const toolCalls: {
  tool: string;
  args: Prisma.InputJsonValue;
  ms: number;
}[] = [];
    const answer = await runWithTools({
      ctx,
      system: buildSystemPrompt(ctx),
      turns,
      onDelta,
      onToolCall: (tool, args, ms) =>
  toolCalls.push({
    tool,
    args: JSON.parse(JSON.stringify(args)) as Prisma.InputJsonValue,
    ms,
  }),
    });

    await prisma.$transaction(async (tx) => {
      await tx.aiMessage.create({
        data: {
          conversationId, role: "ASSISTANT", content: answer,
          toolCalls: toolCalls.length ? toolCalls : undefined,
        },
      });
      await tx.aiConversation.update({
        where: { id: conversationId },
        data: {
          updatedAt: new Date(),
          // First exchange names the conversation
          ...(conversation.messages.length === 0
            ? { title: userMessage.slice(0, 60) }
            : {}),
        },
      });
    });

    // COST CONTROL: fold old turns into the rolling summary (fire-and-forget
    // safe — the next turn works with or without it)
    if (conversation.messages.length + 2 > SUMMARIZE_AFTER) {
      const older = conversation.messages.slice(0, -KEEP_TURNS);
      if (older.length > 0) {
        const text = (conversation.summary ? `Earlier summary: ${conversation.summary}\n` : "") +
          older.map((m) => `${m.role}: ${m.content}`).join("\n");
        const newSummary = await summarize(text);
        if (newSummary) {
          await prisma.aiConversation.update({
            where: { id: conversationId }, data: { summary: newSummary },
          });
        }
      }
    }

    return { answer, toolCalls };
  },

  // ---------- one-click business insights ----------
  // Each insight is a canned expert prompt through the SAME secure
  // pipeline — no separate code path to audit.
  insightPrompt(kind: string): string {
    const prompts: Record<string, string> = {
      weekly: "Prepare my weekly business summary: sales, profit, expenses vs last week, top products, anything that needs attention. Use tools for every number.",
      monthly: "Prepare my monthly business summary: full financials with deltas, top products and customers, inventory status, and 3 concrete recommendations.",
      profit: "Analyze my profit this month: gross vs net margin, which products drive profit (not just revenue), and where margin is leaking. Use tools.",
      loss: "Find where I'm losing money: refunds, dead stock value, products selling below target margin, and expense categories growing faster than revenue.",
      growth: "Analyze my growth: revenue trend with the deterministic forecast, customer growth, and what's driving or limiting growth.",
      inventory: "Give me inventory insights: turnover, dead stock, fast/slow movers, low stock, and what to reorder with suggested quantities and suppliers.",
      expenses: "Analyze my expenses by category this month vs last month and suggest concrete optimizations.",
      customers: "Analyze customer trends: top customers, AOV, growth of the customer base, and outstanding balances I should collect.",
      suppliers: "Recommend suppliers: for products I need to reorder, compare suppliers on last cost and lead time, and flag any supplier risk.",
    };
    const prompt = prompts[kind];
    if (!prompt) throw new NotFoundError("Insight");
    return prompt;
  },
};
