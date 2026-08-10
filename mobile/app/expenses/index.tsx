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
import { ArrowRight, Receipt, RotateCcw, Trash2 } from "lucide-react-native";

import {
  getExpenses,
  getExpenseErrorMessage,
  type ExpenseCategory,
  type ExpenseListItem,
} from "@/services/expenses-service";

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

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  RENT: "إيجار",
  UTILITIES: "فواتير",
  SALARIES: "رواتب",
  MARKETING: "تسويق",
  SUPPLIES: "مستلزمات",
  TRANSPORT: "نقل",
  MAINTENANCE: "صيانة",
  TAXES: "ضرائب",
  INSURANCE: "تأمين",
  OTHER: "أخرى",
};

const CATEGORY_FILTERS: { value: ExpenseCategory | "ALL"; label: string }[] = [
  { value: "ALL", label: "الكل" },
  ...(Object.entries(CATEGORY_LABELS) as [ExpenseCategory, string][]).map(([value, label]) => ({ value, label })),
];

const PER_PAGE = 20;

function money(value: number | string) {
  return `${Number(value).toFixed(2)} د.م`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ar-MA", { year: "numeric", month: "short", day: "numeric" });
}

export default function ExpensesListScreen() {
  const [expenses, setExpenses] = useState<ExpenseListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [sumAmount, setSumAmount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [category, setCategory] = useState<ExpenseCategory | "ALL">("ALL");
  const [showTrash, setShowTrash] = useState(false);

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
        const result = await getExpenses({
          category: category === "ALL" ? undefined : category,
          deleted: showTrash,
          page: targetPage,
          perPage: PER_PAGE,
        });

        setExpenses((current) => (mode === "more" ? [...current, ...result.items] : result.items));
        setTotal(result.total);
        setSumAmount(result.sumAmount);
        setPage(result.page);
        setTotalPages(result.totalPages);
      } catch (error) {
        setErrorMessage(getExpenseErrorMessage(error, "تعذر تحميل المصاريف."));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      }
    },
    [category, showTrash]
  );

  useEffect(() => {
    loadPage(1, "initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, showTrash]);

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
          accessibilityLabel={showTrash ? "المصاريف" : "المحذوفات"}
          onPress={() => setShowTrash((v) => !v)}
          style={[styles.trashButton, showTrash && styles.trashButtonActive]}
        >
          <Trash2 size={20} color={showTrash ? "#FFFFFF" : COLORS.text} strokeWidth={2.2} />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.title}>{showTrash ? "المحذوفات" : "المصاريف"}</Text>
          <Text style={styles.subtitle}>{isLoading ? "جارِ التحميل…" : `${total} مصروف · ${money(sumAmount)}`}</Text>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} hitSlop={8}>
          <ArrowRight size={22} color={COLORS.text} strokeWidth={2.2} />
        </Pressable>
      </View>

      {!showTrash ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterScrollContent}
        >
          {CATEGORY_FILTERS.map((filter) => {
            const selected = category === filter.value;
            return (
              <Pressable
                key={filter.value}
                onPress={() => setCategory(filter.value)}
                style={[styles.filterChip, selected && styles.filterChipSelected]}
              >
                <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>{filter.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

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
          data={expenses}
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
                <Receipt size={28} color={COLORS.primary} strokeWidth={2} />
              </View>
              <Text style={styles.emptyTitle}>{showTrash ? "لا توجد مصاريف محذوفة" : "لا توجد مصاريف بعد"}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/expenses/${item.id}`)}>
              <Text style={styles.amount}>{money(item.amount)}</Text>

              <View style={styles.rowInfo}>
                <Text style={styles.expenseTitle} numberOfLines={1}>
                  {item.title}
                  {item.isRecurring ? " ↻" : ""}
                </Text>
                <Text style={styles.meta}>
                  {CATEGORY_LABELS[item.category]} · {formatDate(item.date)}
                  {item.supplier ? ` · ${item.supplier.name}` : ""}
                </Text>
              </View>
            </Pressable>
          )}
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
  trashButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  trashButtonActive: {
    backgroundColor: COLORS.danger,
    borderColor: COLORS.danger,
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
  expenseTitle: {
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
  amount: {
    color: COLORS.text,
    fontSize: 13.5,
    fontWeight: "800",
  },
});
