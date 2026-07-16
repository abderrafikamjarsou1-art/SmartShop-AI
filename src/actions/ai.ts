"use server";

import { requireRole } from "@/lib/tenant";
import { safeAction, type ActionResult } from "@/lib/safe-action";
import { zParse, zUuid } from "@/lib/validation";
import { aiService } from "@/services/ai-service";
import { z } from "zod";

export async function createAiConversation(): Promise<ActionResult<{ id: string }>> {
  return safeAction("ai.createConversation", async () => {
    const ctx = await requireRole("ai:use");
    const conversation = await aiService.createConversation(ctx);
    return { id: conversation.id };
  });
}

export async function deleteAiConversation(id: string): Promise<ActionResult<{ id: string }>> {
  return safeAction("ai.deleteConversation", async () => {
    const ctx = await requireRole("ai:use");
    await aiService.deleteConversation(ctx, zParse(zUuid, id));
    return { id };
  });
}

const insightSchema = z.enum([
  "weekly", "monthly", "profit", "loss", "growth",
  "inventory", "expenses", "customers", "suppliers",
]);

/** One-click insights = a canned prompt for the chat pipeline. */
export async function getInsightPrompt(kind: string): Promise<ActionResult<{ prompt: string }>> {
  return safeAction("ai.insightPrompt", async () => {
    await requireRole("ai:use");
    return { prompt: aiService.insightPrompt(zParse(insightSchema, kind)) };
  });
}
