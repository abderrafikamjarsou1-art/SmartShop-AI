"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, MessageSquarePlus, Send, Sparkles, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { createAiConversation, deleteAiConversation, getInsightPrompt } from "@/actions/ai";
import { LazyAiChart } from "@/components/ai/ai-chart";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Conversation { id: string; title: string; updatedAt: string }
interface Message { role: "user" | "assistant"; content: string; tools?: string[] }

const SUGGESTED = [
  "How much profit did I make this month?",
  "What products are selling the most?",
  "What should I reorder?",
  "Predict next month's revenue",
  "Analyze my business",
];

const INSIGHTS: { key: string; label: string }[] = [
  { key: "weekly", label: "Weekly summary" },
  { key: "monthly", label: "Monthly summary" },
  { key: "profit", label: "Profit analysis" },
  { key: "loss", label: "Loss analysis" },
  { key: "growth", label: "Growth" },
  { key: "inventory", label: "Inventory insights" },
  { key: "expenses", label: "Expense optimization" },
  { key: "customers", label: "Customer trends" },
  { key: "suppliers", label: "Supplier recommendations" },
];

export function AiChat({ initialConversations, businessName }: {
  initialConversations: Conversation[]; businessName: string;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const ensureConversation = async (): Promise<string | null> => {
    if (activeId) return activeId;
    const r = await createAiConversation();
    if (!r.success) { toast.error(r.error); return null; }
    setConversations((c) => [{ id: r.data.id, title: "New conversation", updatedAt: new Date().toISOString() }, ...c]);
    setActiveId(r.data.id);
    return r.data.id;
  };

  const openConversation = async (id: string) => {
    setActiveId(id);
    // Load history via a lightweight fetch to the page's server action-free path:
    // messages are rendered from the stream we keep client-side; on reopen we
    // refetch from a tiny route to avoid holding all history in memory.
    const res = await fetch(`/api/ai/chat?conversationId=${id}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages);
    }
  };

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || streaming) return;
    const conversationId = await ensureConversation();
    if (!conversationId) return;

    setInput("");
    setMessages((m) => [...m, { role: "user", content: message }, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Request failed." }));
        throw new Error(err.error);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, idx); buffer = buffer.slice(idx + 2);
          const event = frame.match(/^event: (.+)$/m)?.[1];
          const dataRaw = frame.match(/^data: (.+)$/m)?.[1];
          if (!event || !dataRaw) continue;
          const data = JSON.parse(dataRaw);

          if (event === "delta") {
            setMessages((m) => {
              const next = [...m];
              next[next.length - 1] = { ...next[next.length - 1], content: next[next.length - 1].content + data.text };
              return next;
            });
          } else if (event === "done") {
            setMessages((m) => {
              const next = [...m];
              next[next.length - 1] = { ...next[next.length - 1], tools: data.toolCalls };
              return next;
            });
          } else if (event === "error") {
            throw new Error(data.message);
          }
        }
      }
    } catch (e) {
      setMessages((m) => m.slice(0, -1)); // drop the empty assistant bubble
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setStreaming(false);
    }
  };

  const runInsight = async (kind: string) => {
    const r = await getInsightPrompt(kind);
    if (r.success) send(r.data.prompt);
    else toast.error(r.error);
  };

  return (
    <div className="grid h-[calc(100dvh-8.5rem)] gap-4 lg:grid-cols-4">
      {/* Sidebar: history + insights */}
      <Card className="hidden shadow-soft lg:block">
        <CardContent className="flex h-full flex-col p-4">
          <Button variant="outline" className="mb-3 justify-start" onClick={() => { setActiveId(null); setMessages([]); }}>
            <MessageSquarePlus className="size-4" aria-hidden /> New conversation
          </Button>

          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Insights</p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {INSIGHTS.map((i) => (
              <button key={i.key} onClick={() => runInsight(i.key)} disabled={streaming}
                className="rounded-full border px-2.5 py-1 text-xs hover:bg-accent hover:text-accent-foreground disabled:opacity-50">
                {i.label}
              </button>
            ))}
          </div>

          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">History</p>
          <ul className="flex-1 space-y-1 overflow-y-auto">
            {conversations.map((c) => (
              <li key={c.id} className="group flex items-center gap-1">
                <button onClick={() => openConversation(c.id)}
                  className={`min-w-0 flex-1 truncate rounded-lg px-2.5 py-1.5 text-left text-sm
                    ${c.id === activeId ? "bg-accent text-accent-foreground" : "hover:bg-secondary"}`}>
                  {c.title}
                </button>
                <button aria-label={`Delete ${c.title}`}
                  className="hidden rounded p-1 text-muted-foreground hover:text-destructive group-hover:block"
                  onClick={async () => {
                    const r = await deleteAiConversation(c.id);
                    if (r.success) {
                      setConversations((list) => list.filter((x) => x.id !== c.id));
                      if (activeId === c.id) { setActiveId(null); setMessages([]); }
                    }
                  }}>
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Chat pane */}
      <Card className="shadow-soft lg:col-span-3">
        <CardContent className="flex h-full flex-col p-4">
          <div className="flex-1 space-y-4 overflow-y-auto pr-1" aria-live="polite">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-accent">
                  <Sparkles className="size-5 text-accent-foreground" aria-hidden />
                </span>
                <h2 className="display-tight text-lg font-semibold">Your {businessName} copilot</h2>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Every answer is grounded in your real data — sales, stock, customers, money.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {SUGGESTED.map((s) => (
                    <button key={s} onClick={() => send(s)}
                      className="rounded-full border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message, i) => (
              <div key={i} className={message.role === "user" ? "flex justify-end" : ""}>
                <div className={message.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground"
                  : "max-w-[95%]"}>
                  {message.role === "assistant" ? (
                    <AssistantMessage content={message.content} tools={message.tools} streaming={streaming && i === messages.length - 1} />
                  ) : message.content}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <form className="mt-3 flex items-end gap-2"
            onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder="Ask about your business…"
              rows={1}
              className="min-h-11 flex-1 resize-none"
              aria-label="Message"
            />
            <Button type="submit" size="icon" className="size-11" disabled={streaming || !input.trim()} aria-label="Send">
              {streaming ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

/** Markdown + tables + code blocks + ```chart blocks rendered with Recharts. */
function AssistantMessage({ content, tools, streaming }: { content: string; tools?: string[]; streaming: boolean }) {
  // Split out ```chart fenced blocks; the rest is normal markdown
  const parts = content.split(/```chart\s*([\s\S]*?)```/g);

  return (
    <div className="space-y-2">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <LazyAiChart key={i} spec={part} />
        ) : (
          part.trim() && (
            <div key={i} className="prose prose-sm dark:prose-invert max-w-none [&_table]:my-2 [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{part}</ReactMarkdown>
            </div>
          )
        )
      )}
      {streaming && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Thinking" />}
      {tools && tools.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {[...new Set(tools)].map((t) => (
            <Badge key={t} variant="secondary" className="gap-1 text-[10px]">
              <Wrench className="size-2.5" aria-hidden /> {t}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
