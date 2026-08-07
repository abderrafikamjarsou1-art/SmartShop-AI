import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { ArrowRight, MessageSquarePlus, RotateCcw, Sparkles, Trash2 } from "lucide-react-native";

import {
  createConversation,
  deleteConversation,
  getAiErrorMessage,
  getConversations,
  getInsightPrompt,
  type AiInsightKind,
  type Conversation,
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
};

const INSIGHTS: { key: AiInsightKind; label: string }[] = [
  { key: "weekly", label: "ملخص أسبوعي" },
  { key: "monthly", label: "ملخص شهري" },
  { key: "profit", label: "تحليل الأرباح" },
  { key: "loss", label: "تحليل الخسائر" },
  { key: "growth", label: "النمو" },
  { key: "inventory", label: "رؤى المخزون" },
  { key: "expenses", label: "تحسين المصاريف" },
  { key: "customers", label: "اتجاهات العملاء" },
  { key: "suppliers", label: "توصيات الموردين" },
];

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} س`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} ي`;
}

export default function AiConversationsScreen() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyInsight, setBusyInsight] = useState<AiInsightKind | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setIsLoading(true);
    else setIsRefreshing(true);
    setErrorMessage(null);
    try {
      const result = await getConversations();
      setConversations(result);
    } catch (error) {
      setErrorMessage(getAiErrorMessage(error, "تعذر تحميل المحادثات."));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load("initial");
  }, [load]);

  async function handleNewConversation() {
    if (creating) return;
    setCreating(true);
    try {
      const conversation = await createConversation();
      router.push(`/ai/${conversation.id}`);
    } catch (error) {
      Alert.alert("تعذر البدء", getAiErrorMessage(error, "تعذر بدء محادثة جديدة."));
    } finally {
      setCreating(false);
    }
  }

  async function handleInsight(kind: AiInsightKind) {
    if (busyInsight) return;
    setBusyInsight(kind);
    try {
      const [conversation, prompt] = await Promise.all([createConversation(), getInsightPrompt(kind)]);
      router.push({ pathname: "/ai/[id]", params: { id: conversation.id, prompt } });
    } catch (error) {
      Alert.alert("تعذر التحميل", getAiErrorMessage(error, "تعذر تحميل هذه الرؤية."));
    } finally {
      setBusyInsight(null);
    }
  }

  function handleDelete(conversation: Conversation) {
    Alert.alert("حذف المحادثة", `هل تريد حذف "${conversation.title ?? "محادثة جديدة"}"؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteConversation(conversation.id);
            setConversations((current) => current.filter((c) => c.id !== conversation.id));
          } catch (error) {
            Alert.alert("تعذر الحذف", getAiErrorMessage(error, "حدث خطأ أثناء حذف المحادثة."));
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="محادثة جديدة"
          onPress={handleNewConversation}
          disabled={creating}
          style={styles.addButton}
        >
          {creating ? <ActivityIndicator color="#FFFFFF" size="small" /> : <MessageSquarePlus size={20} color="#FFFFFF" strokeWidth={2.2} />}
        </Pressable>

        <Text style={styles.title}>المساعد الذكي</Text>

        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} hitSlop={8}>
          <ArrowRight size={22} color={COLORS.text} strokeWidth={2.2} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : errorMessage ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Pressable style={styles.retryButton} onPress={() => load("initial")}>
            <RotateCcw size={16} color="#FFFFFF" strokeWidth={2.4} />
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load("refresh")} tintColor={COLORS.primary} />}
          ListHeaderComponent={
            <>
              <Text style={styles.sectionLabel}>رؤى سريعة</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.insightScroll}
                contentContainerStyle={styles.insightScrollContent}
              >
                {INSIGHTS.map((insight) => (
                  <Pressable
                    key={insight.key}
                    onPress={() => handleInsight(insight.key)}
                    disabled={busyInsight !== null}
                    style={styles.insightChip}
                  >
                    {busyInsight === insight.key ? (
                      <ActivityIndicator color={COLORS.primary} size="small" />
                    ) : (
                      <>
                        <Sparkles size={13} color={COLORS.primary} strokeWidth={2.2} />
                        <Text style={styles.insightChipText}>{insight.label}</Text>
                      </>
                    )}
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.sectionLabel}>المحادثات</Text>
            </>
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Sparkles size={28} color={COLORS.primary} strokeWidth={2} />
              </View>
              <Text style={styles.emptyTitle}>لا توجد محادثات بعد</Text>
              <Text style={styles.emptySubtitle}>اسأل عن مبيعاتك، أرباحك، أو مخزونك — وستجيب مستندًا إلى بياناتك الفعلية.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/ai/${item.id}`)}>
              <Pressable accessibilityRole="button" accessibilityLabel="حذف" onPress={() => handleDelete(item)} hitSlop={8}>
                <Trash2 size={17} color={COLORS.danger} strokeWidth={2} />
              </Pressable>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.title ?? "محادثة جديدة"}
                </Text>
                <Text style={styles.rowMeta}>{relativeTime(item.updatedAt)}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  title: { color: COLORS.text, fontSize: 19, fontWeight: "800" },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  errorText: { color: COLORS.danger, fontSize: 14, fontWeight: "600", textAlign: "center", marginBottom: 16, lineHeight: 21 },
  retryButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  retryText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  listContent: { paddingHorizontal: 18, paddingBottom: 40, flexGrow: 1 },
  sectionLabel: { color: COLORS.text, fontSize: 13.5, fontWeight: "800", textAlign: "right", marginBottom: 10, marginTop: 4 },
  insightScroll: { marginBottom: 18 },
  insightScrollContent: { flexDirection: "row-reverse", gap: 8 },
  insightChip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: COLORS.primarySoft,
    minWidth: 44,
    justifyContent: "center",
  },
  insightChipText: { color: COLORS.primary, fontSize: 12, fontWeight: "700" },
  separator: { height: 10 },
  emptyState: { alignItems: "center", justifyContent: "center", paddingTop: 40, paddingHorizontal: 24 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primarySoft,
    marginBottom: 16,
  },
  emptyTitle: { color: COLORS.text, fontSize: 16, fontWeight: "800", marginBottom: 6 },
  emptySubtitle: { color: COLORS.muted, fontSize: 12.5, textAlign: "center", lineHeight: 19 },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  rowInfo: { flex: 1, alignItems: "flex-end" },
  rowTitle: { color: COLORS.text, fontSize: 14, fontWeight: "700", textAlign: "right" },
  rowMeta: { color: COLORS.muted, fontSize: 11.5, marginTop: 3 },
});
