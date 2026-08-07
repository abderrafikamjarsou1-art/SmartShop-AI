import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCheck,
  CreditCard,
  Info,
  RotateCcw,
  ShoppingCart,
  Trash2,
  Wallet,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";

import {
  deleteNotification,
  getNotificationErrorMessage,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
  type NotificationType,
} from "@/services/notifications-service";

const COLORS = {
  background: "#F7F8FC",
  surface: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  border: "#E9ECF2",
  primary: "#5B5CE2",
  primarySoft: "#EEF0FF",
  danger: "#DC2626",
  warning: "#B45309",
  warningSoft: "#FFFBEB",
  success: "#16A34A",
  successSoft: "#ECFDF3",
};

const TYPE_META: Record<NotificationType, { label: string; icon: LucideIcon; color: string; bg: string }> = {
  LOW_STOCK: { label: "مخزون منخفض", icon: AlertTriangle, color: COLORS.warning, bg: COLORS.warningSoft },
  SALE: { label: "عملية بيع", icon: ShoppingCart, color: COLORS.primary, bg: COLORS.primarySoft },
  PAYMENT: { label: "دفعة", icon: Wallet, color: COLORS.success, bg: COLORS.successSoft },
  SUBSCRIPTION: { label: "الاشتراك", icon: CreditCard, color: COLORS.primary, bg: COLORS.primarySoft },
  SYSTEM: { label: "النظام", icon: Info, color: COLORS.muted, bg: "#F3F4F6" },
};

const PER_PAGE = 20;

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

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const loadPage = useCallback(
    async (targetPage: number, mode: "initial" | "refresh" | "more") => {
      if (mode === "initial") setIsLoading(true);
      if (mode === "refresh") setIsRefreshing(true);
      if (mode === "more") setIsLoadingMore(true);
      setErrorMessage(null);

      try {
        const result = await getNotifications({ unreadOnly, page: targetPage, perPage: PER_PAGE });
        setNotifications((current) => (mode === "more" ? [...current, ...result.items] : result.items));
        setTotal(result.total);
        setUnreadCount(result.unreadCount);
        setPage(result.page);
        setTotalPages(result.totalPages);
      } catch (error) {
        setErrorMessage(getNotificationErrorMessage(error, "تعذر تحميل الإشعارات."));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      }
    },
    [unreadOnly]
  );

  useEffect(() => {
    loadPage(1, "initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadOnly]);

  const handleRefresh = useCallback(() => loadPage(1, "refresh"), [loadPage]);

  const handleLoadMore = useCallback(() => {
    if (isLoadingMore || isLoading || page >= totalPages) return;
    loadPage(page + 1, "more");
  }, [isLoadingMore, isLoading, page, totalPages, loadPage]);

  async function handleOpen(notification: Notification) {
    if (notification.readAt) return;
    try {
      await markNotificationRead(notification.id);
      setNotifications((current) =>
        current.map((n) => (n.id === notification.id ? { ...n, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch {
      // best-effort — the row already looks read locally; a retry via refresh will reconcile
    }
  }

  async function handleMarkAllRead() {
    if (markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      const now = new Date().toISOString();
      setNotifications((current) => current.map((n) => (n.readAt ? n : { ...n, readAt: now })));
      setUnreadCount(0);
    } catch (error) {
      Alert.alert("تعذر التحديث", getNotificationErrorMessage(error, "تعذر تعليم الكل كمقروء."));
    } finally {
      setMarkingAll(false);
    }
  }

  function handleDelete(notification: Notification) {
    Alert.alert("حذف الإشعار", "هل تريد حذف هذا الإشعار؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteNotification(notification.id);
            setNotifications((current) => current.filter((n) => n.id !== notification.id));
            setTotal((t) => Math.max(0, t - 1));
            if (!notification.readAt) setUnreadCount((count) => Math.max(0, count - 1));
          } catch (error) {
            Alert.alert("تعذر الحذف", getNotificationErrorMessage(error, "حدث خطأ أثناء حذف الإشعار."));
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
          accessibilityLabel="تعليم الكل كمقروء"
          onPress={handleMarkAllRead}
          disabled={markingAll || unreadCount === 0}
          style={[styles.markAllButton, unreadCount === 0 && styles.markAllButtonDisabled]}
        >
          {markingAll ? <ActivityIndicator color={COLORS.primary} size="small" /> : <CheckCheck size={19} color={COLORS.primary} strokeWidth={2.2} />}
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.title}>الإشعارات</Text>
          <Text style={styles.subtitle}>{isLoading ? "جارِ التحميل…" : `${total} إشعار${unreadCount > 0 ? ` · ${unreadCount} غير مقروء` : ""}`}</Text>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} hitSlop={8}>
          <ArrowRight size={22} color={COLORS.text} strokeWidth={2.2} />
        </Pressable>
      </View>

      <View style={styles.filterRow}>
        <Pressable onPress={() => setUnreadOnly(false)} style={[styles.filterChip, !unreadOnly && styles.filterChipSelected]}>
          <Text style={[styles.filterChipText, !unreadOnly && styles.filterChipTextSelected]}>الكل</Text>
        </Pressable>
        <Pressable onPress={() => setUnreadOnly(true)} style={[styles.filterChip, unreadOnly && styles.filterChipSelected]}>
          <Text style={[styles.filterChipText, unreadOnly && styles.filterChipTextSelected]}>غير مقروءة</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : errorMessage ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Pressable style={styles.retryButton} onPress={() => loadPage(1, "initial")}>
            <RotateCcw size={16} color="#FFFFFF" strokeWidth={2.4} />
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={handleLoadMore}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListFooterComponent={isLoadingMore ? <ActivityIndicator color={COLORS.primary} style={styles.footerLoading} /> : null}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Bell size={28} color={COLORS.primary} strokeWidth={2} />
              </View>
              <Text style={styles.emptyTitle}>{unreadOnly ? "لا توجد إشعارات غير مقروءة" : "لا توجد إشعارات بعد"}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const meta = TYPE_META[item.type];
            const Icon = meta.icon;
            const isUnread = !item.readAt;
            return (
              <Pressable style={styles.row} onPress={() => handleOpen(item)}>
                <Pressable accessibilityRole="button" accessibilityLabel="حذف" onPress={() => handleDelete(item)} hitSlop={8}>
                  <Trash2 size={16} color={COLORS.danger} strokeWidth={2} />
                </Pressable>

                <View style={styles.rowInfo}>
                  <View style={styles.rowTitleLine}>
                    {isUnread ? <View style={styles.unreadDot} /> : null}
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                  </View>
                  <Text style={styles.rowMessage} numberOfLines={2}>
                    {item.message}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {meta.label} · {relativeTime(item.createdAt)}
                  </Text>
                </View>

                <View style={[styles.typeIcon, { backgroundColor: meta.bg }]}>
                  <Icon size={17} color={meta.color} strokeWidth={2.1} />
                </View>
              </Pressable>
            );
          }}
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
  headerCenter: { alignItems: "flex-end", flex: 1, marginHorizontal: 12 },
  title: { color: COLORS.text, fontSize: 22, fontWeight: "800", textAlign: "right" },
  subtitle: { color: COLORS.muted, fontSize: 12, fontWeight: "600", marginTop: 2 },
  markAllButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primarySoft,
  },
  markAllButtonDisabled: { opacity: 0.4 },
  filterRow: { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 18, marginBottom: 10 },
  filterChip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterChipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipText: { fontSize: 12, fontWeight: "700", color: COLORS.muted },
  filterChipTextSelected: { color: "#FFFFFF" },
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
  listContent: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 40, flexGrow: 1 },
  separator: { height: 10 },
  footerLoading: { paddingVertical: 20 },
  emptyState: { alignItems: "center", justifyContent: "center", paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primarySoft,
    marginBottom: 16,
  },
  emptyTitle: { color: COLORS.text, fontSize: 16, fontWeight: "800" },
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
  rowTitleLine: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  rowTitle: { color: COLORS.text, fontSize: 14, fontWeight: "700", textAlign: "right" },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.primary },
  rowMessage: { color: COLORS.muted, fontSize: 12.5, textAlign: "right", marginTop: 3, lineHeight: 18 },
  rowMeta: { color: COLORS.muted, fontSize: 11, textAlign: "right", marginTop: 5 },
  typeIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
});
