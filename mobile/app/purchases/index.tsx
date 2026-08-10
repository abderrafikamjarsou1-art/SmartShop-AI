import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { ArrowRight, ClipboardList, Plus, RotateCcw } from "lucide-react-native";

import {
  getPurchases,
  getPurchaseErrorMessage,
  type PurchaseListItem,
  type PurchaseStatus,
} from "@/services/purchases-service";

const COLORS = {
  background: "#F7F8FC",
  surface: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  border: "#E9ECF2",
  primary: "#5B5CE2",
  primarySoft: "#EEF0FF",
  warning: "#B45309",
  warningSoft: "#FFFBEB",
  success: "#16A34A",
  successSoft: "#ECFDF3",
  danger: "#DC2626",
  dangerSoft: "#FEF2F2",
};

const STATUS_FILTERS: { value: PurchaseStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "الكل" },
  { value: "DRAFT", label: "مسودة" },
  { value: "ORDERED", label: "مطلوب" },
  { value: "PARTIALLY_RECEIVED", label: "مستلم جزئيًا" },
  { value: "RECEIVED", label: "مستلم" },
  { value: "CANCELLED", label: "ملغى" },
];

const STATUS_STYLE: Record<PurchaseStatus, { label: string; color: string; bg: string }> = {
  DRAFT: { label: "مسودة", color: COLORS.muted, bg: "#F3F4F6" },
  ORDERED: { label: "مطلوب", color: COLORS.primary, bg: COLORS.primarySoft },
  PARTIALLY_RECEIVED: { label: "مستلم جزئيًا", color: COLORS.warning, bg: COLORS.warningSoft },
  RECEIVED: { label: "مستلم", color: COLORS.success, bg: COLORS.successSoft },
  CANCELLED: { label: "ملغى", color: COLORS.danger, bg: COLORS.dangerSoft },
};

const PER_PAGE = 20;

export default function PurchasesListScreen() {
  const [purchases, setPurchases] = useState<PurchaseListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState<PurchaseStatus | "ALL">("ALL");

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadPage = useCallback(
    async (targetPage: number, mode: "initial" | "refresh" | "more") => {
      if (mode === "initial") setIsLoading(true);
      if (mode === "refresh") setIsRefreshing(true);
      if (mode === "more") setIsLoadingMore(true);
      setErrorMessage(null);

      try {
        const result = await getPurchases({
          status: status === "ALL" ? undefined : status,
          page: targetPage,
          perPage: PER_PAGE,
          sortDir: "desc",
        });

        setPurchases((current) => (mode === "more" ? [...current, ...result.items] : result.items));
        setTotal(result.total);
        setPage(result.page);
        setTotalPages(result.totalPages);
      } catch (error) {
        setErrorMessage(getPurchaseErrorMessage(error, "تعذر تحميل طلبات الشراء."));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      }
    },
    [status]
  );

  useEffect(() => {
    loadPage(1, "initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const handleRefresh = useCallback(() => loadPage(1, "refresh"), [loadPage]);

  const handleLoadMore = useCallback(() => {
    if (isLoadingMore || isLoading || page >= totalPages) return;
    loadPage(page + 1, "more");
  }, [isLoadingMore, isLoading, page, totalPages, loadPage]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="طلب شراء جديد"
          onPress={() => router.push("/purchases/new")}
          style={styles.addButton}
        >
          <Plus size={22} color="#FFFFFF" strokeWidth={2.4} />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.title}>المشتريات</Text>
          <Text style={styles.subtitle}>{isLoading ? "جارِ التحميل…" : `${total} طلب`}</Text>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} hitSlop={8}>
          <ArrowRight size={22} color={COLORS.text} strokeWidth={2.2} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterScrollContent}
      >
        {STATUS_FILTERS.map((filter) => {
          const selected = status === filter.value;
          return (
            <Pressable
              key={filter.value}
              onPress={() => setStatus(filter.value)}
              style={[styles.filterChip, selected && styles.filterChipSelected]}
            >
              <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>{filter.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

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
          data={purchases}
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
                <ClipboardList size={28} color={COLORS.primary} strokeWidth={2} />
              </View>
              <Text style={styles.emptyTitle}>لا توجد طلبات شراء بعد</Text>
              <Pressable style={styles.emptyButton} onPress={() => router.push("/purchases/new")}>
                <Plus size={16} color="#FFFFFF" strokeWidth={2.4} />
                <Text style={styles.emptyButtonText}>طلب شراء جديد</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => {
            const style = STATUS_STYLE[item.status];
            const totalUnits = item.items.reduce((s, i) => s + i.quantity, 0);
            const receivedUnits = item.items.reduce((s, i) => s + i.receivedQuantity, 0);
            return (
              <Pressable style={styles.row} onPress={() => router.push(`/purchases/${item.id}`)}>
                <View style={[styles.badge, { backgroundColor: style.bg }]}>
                  <Text style={[styles.badgeText, { color: style.color }]}>{style.label}</Text>
                </View>

                <Text style={styles.total}>{Number(item.total).toFixed(2)} د.م</Text>

                <View style={styles.rowInfo}>
                  <Text style={styles.supplierName} numberOfLines={1}>
                    {item.supplier?.name ?? "بدون مورد"}
                  </Text>
                  <Text style={styles.meta}>
                    PO-{String(item.purchaseNumber).padStart(4, "0")} · {receivedUnits}/{totalUnits} وحدة
                  </Text>
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
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  headerCenter: {
    alignItems: "flex-end",
    flex: 1,
    marginHorizontal: 12,
  },
  title: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "right",
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  filterScroll: {
    marginBottom: 10,
  },
  filterScrollContent: {
    flexDirection: "row-reverse",
    paddingHorizontal: 18,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.muted,
  },
  filterChipTextSelected: {
    color: "#FFFFFF",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 21,
  },
  retryButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  retryText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 40,
    flexGrow: 1,
  },
  separator: {
    height: 10,
  },
  footerLoading: {
    paddingVertical: 20,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primarySoft,
    marginBottom: 16,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 16,
  },
  emptyButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  emptyButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  rowInfo: {
    flex: 1,
    alignItems: "flex-end",
  },
  supplierName: {
    color: COLORS.text,
    fontSize: 14.5,
    fontWeight: "700",
    textAlign: "right",
  },
  meta: {
    color: COLORS.muted,
    fontSize: 11.5,
    marginTop: 3,
  },
  total: {
    color: COLORS.text,
    fontSize: 13.5,
    fontWeight: "800",
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: "800",
  },
});
