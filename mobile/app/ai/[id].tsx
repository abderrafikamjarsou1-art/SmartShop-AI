import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowRight, Send, Sparkles, Trash2, Wrench } from "lucide-react-native";

import {
  deleteConversation,
  getAiErrorMessage,
  getConversationHistory,
  sendChatMessage,
  type ChatMessage,
} from "@/services/ai-service";

const COLORS = {
  background: "#F7F8FC",
  surface: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  border: "#E9ECF2",
  primary: "#5B5CE2",
  primarySoft: "#EEF0FF",
  danger: "#DC2626",
  dangerSoft: "#FEF2F2",
};

const SUGGESTED = [
  "كم كان ربحي هذا الشهر؟",
  "ما هي المنتجات الأكثر مبيعًا؟",
  "ما الذي يجب أن أعيد طلبه؟",
  "توقع إيرادات الشهر القادم",
  "حلل أداء عملي",
];

/** Splits out ```chart fenced blocks — rendered as a note, not a chart (no chart library on mobile yet). */
function renderAssistantContent(content: string) {
  const parts = content.split(/```chart\s*([\s\S]*?)```/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <View key={i} style={styles.chartNote}>
        <Text style={styles.chartNoteText}>📊 رسم بياني متاح في نسخة الويب</Text>
      </View>
    ) : part.trim() ? (
      <Text key={i} style={styles.assistantText}>
        {part.trim()}
      </Text>
    ) : null
  );
}

export default function AiChatScreen() {
  const { id, prompt } = useLocalSearchParams<{ id: string; prompt?: string }>();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const autoSentRef = useRef(false);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || streaming || !id) return;

      setInput("");
      setMessages((m) => [...m, { role: "user", content: message }, { role: "assistant", content: "" }]);
      setStreaming(true);

      try {
        const { toolCalls } = await sendChatMessage(id, message, {
          onDelta: (delta) => {
            setMessages((m) => {
              const next = [...m];
              const last = next[next.length - 1];
              next[next.length - 1] = { ...last, content: last.content + delta };
              return next;
            });
          },
        });
        setMessages((m) => {
          const next = [...m];
          next[next.length - 1] = { ...next[next.length - 1], tools: toolCalls };
          return next;
        });
      } catch (error) {
        setMessages((m) => m.slice(0, -2));
        Alert.alert("تعذر الإرسال", error instanceof Error ? error.message : "حدث خطأ غير متوقع.");
      } finally {
        setStreaming(false);
      }
    },
    [id, streaming]
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const history = await getConversationHistory(id);
        if (cancelled) return;
        setMessages(history);
        if (history.length === 0 && prompt && !autoSentRef.current) {
          autoSentRef.current = true;
          send(prompt);
        }
      } catch (error) {
        if (!cancelled) setLoadError(getAiErrorMessage(error, "تعذر تحميل المحادثة."));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  function handleDelete() {
    if (!id) return;
    Alert.alert("حذف المحادثة", "هل تريد حذف هذه المحادثة؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteConversation(id);
            router.back();
          } catch (error) {
            Alert.alert("تعذر الحذف", getAiErrorMessage(error, "حدث خطأ أثناء حذف المحادثة."));
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} hitSlop={8}>
            <ArrowRight size={22} color={COLORS.text} strokeWidth={2.2} />
          </Pressable>
          <Text style={styles.headerTitle}>المساعد الذكي</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="حذف المحادثة" onPress={handleDelete} hitSlop={8}>
            <Trash2 size={19} color={COLORS.danger} strokeWidth={2.1} />
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={COLORS.primary} size="large" />
          </View>
        ) : loadError ? (
          <View style={styles.centerState}>
            <Text style={styles.errorText}>{loadError}</Text>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <Sparkles size={26} color={COLORS.primary} strokeWidth={2} />
                </View>
                <Text style={styles.emptyTitle}>مساعدك الذكي لعملك</Text>
                <Text style={styles.emptySubtitle}>كل إجابة مبنية على بياناتك الفعلية — المبيعات، المخزون، العملاء، والمال.</Text>
                <View style={styles.suggestedWrap}>
                  {SUGGESTED.map((s) => (
                    <Pressable key={s} style={styles.suggestedChip} onPress={() => send(s)}>
                      <Text style={styles.suggestedChipText}>{s}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              messages.map((message, index) => (
                <View
                  key={index}
                  style={[styles.bubbleRow, message.role === "user" ? styles.bubbleRowUser : styles.bubbleRowAssistant]}
                >
                  {message.role === "user" ? (
                    <View style={styles.userBubble}>
                      <Text style={styles.userBubbleText}>{message.content}</Text>
                    </View>
                  ) : (
                    <View style={styles.assistantBubble}>
                      {message.content.length === 0 && streaming && index === messages.length - 1 ? (
                        <ActivityIndicator color={COLORS.primary} size="small" />
                      ) : (
                        <>
                          {renderAssistantContent(message.content)}
                          {message.tools && message.tools.length > 0 ? (
                            <View style={styles.toolsRow}>
                              {[...new Set(message.tools)].map((tool) => (
                                <View key={tool} style={styles.toolChip}>
                                  <Wrench size={10} color={COLORS.muted} strokeWidth={2.2} />
                                  <Text style={styles.toolChipText}>{tool}</Text>
                                </View>
                              ))}
                            </View>
                          ) : null}
                        </>
                      )}
                    </View>
                  )}
                </View>
              ))
            )}
          </ScrollView>
        )}

        <View style={styles.composer}>
          <Pressable
            style={[styles.sendButton, (!input.trim() || streaming) && styles.sendButtonDisabled]}
            disabled={!input.trim() || streaming}
            onPress={() => send(input)}
          >
            {streaming ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Send size={17} color="#FFFFFF" strokeWidth={2.2} />}
          </Pressable>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="اسأل عن عملك…"
            placeholderTextColor={COLORS.muted}
            style={styles.input}
            multiline
            textAlign="right"
            editable={!streaming}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  headerTitle: { color: COLORS.text, fontSize: 16, fontWeight: "800" },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  errorText: { color: COLORS.danger, fontSize: 14, fontWeight: "600", textAlign: "center", lineHeight: 21 },
  messagesContent: { padding: 18, paddingBottom: 24, flexGrow: 1 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 30 },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primarySoft,
    marginBottom: 14,
  },
  emptyTitle: { color: COLORS.text, fontSize: 17, fontWeight: "800", marginBottom: 6 },
  emptySubtitle: { color: COLORS.muted, fontSize: 12.5, textAlign: "center", lineHeight: 19, maxWidth: 280 },
  suggestedWrap: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 20 },
  suggestedChip: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  suggestedChipText: { color: COLORS.text, fontSize: 12.5, fontWeight: "600" },
  bubbleRow: { marginBottom: 14, flexDirection: "row" },
  bubbleRowUser: { justifyContent: "flex-end" },
  bubbleRowAssistant: { justifyContent: "flex-start" },
  userBubble: {
    maxWidth: "85%",
    backgroundColor: COLORS.primary,
    borderRadius: 18,
    borderBottomRightRadius: 6,
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  userBubbleText: { color: "#FFFFFF", fontSize: 14.5, textAlign: "right", lineHeight: 21 },
  assistantBubble: { maxWidth: "95%" },
  assistantText: { color: COLORS.text, fontSize: 14.5, textAlign: "right", lineHeight: 22 },
  chartNote: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginVertical: 6,
  },
  chartNoteText: { color: COLORS.primary, fontSize: 12, fontWeight: "700", textAlign: "right" },
  toolsRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginTop: 8 },
  toolChip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  toolChipText: { color: COLORS.muted, fontSize: 10, fontWeight: "700" },
  composer: {
    flexDirection: "row-reverse",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 11,
    fontSize: 14.5,
    color: COLORS.text,
    maxHeight: 120,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  sendButtonDisabled: { opacity: 0.5 },
});
