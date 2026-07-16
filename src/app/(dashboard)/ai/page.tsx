import { requireRole } from "@/lib/tenant";
import { aiService } from "@/services/ai-service";
import { AiChat } from "@/components/ai/chat";

export const metadata = { title: "AI Assistant" };

export default async function AiPage() {
  const ctx = await requireRole("ai:use");
  const conversations = await aiService.listConversations(ctx);

  return (
    <AiChat
      initialConversations={conversations.map((c) => ({
        id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString(),
      }))}
      businessName={ctx.business.name}
    />
  );
}
