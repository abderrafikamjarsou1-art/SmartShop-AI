import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { ArrowRight, Plus, RotateCcw, Search, Users, X } from "lucide-react-native";

import { getCustomers, getCustomerErrorMessage, type Customer, type CustomerFilters } from "@/services/customers-service";

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
  success: "#16A34A",
  successSoft: "#ECFDF3",
};

const BALANCE_FILTERS: { value: NonNullable<CustomerFilters["balance"]>; label: string }[] = [
  { value: "all", label: "الكل" },
  { value: "owing", label: "مدينون" },
  { value: "credit", label: "لديهم رصيد" },
];

const PER_PAGE = 20;
const SEARCH_DEBOUNCE_MS = 400;

export default function CustomersListScreen() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [balance, setBalance] = useState<NonNullable<CustomerFilters["balance"]>>("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const loadPage = useCallback(
    async (targetPage: number, mode: "initial" | "refresh" | "more") => {
      if (mode === "initial") setIsLoading(true);
      if (mode === "refresh") setIsRefreshing(true);
      if (mode === "more") setIsLoadingMore(true);
      setErrorMessage(null);

      try {
        const result = await getCustomers({
          q: debouncedQuery || undefined,
          balance,
          page: targetPage,
          perPage: PER_PAGE,
          sortBy: "createdAt",
          sortDir: "desc",
        });

        setCustomers((current) => (mode === "more" ? [...current, ...result.items] : result.items));
        setTotal(result.total);
        setPage(result.page);
        setTotalPages(result.totalPages);
      } catch (error) {
        setErrorMessage(getCustomerErrorMessage(error, "تعذر تحميل العملاء. حاول مرة أخرى."));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      }
    },
    [debouncedQuery, balance]
  );

  useEffect(() => {
    loadPage(1, "initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, balance]);

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
          accessibilityLabel="إضافة عميل"
          onPress={() => router.push("/customers/new")}
          style={styles.addButton}
        >
          <Plus size={22} color="#FFFFFF" strokeWidth={2.4} />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.title}>العملاء</Text>
          <Text style={styles.subtitle}>{isLoading ? "جارِ التحميل…" : `${total} عميل`}</Text>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} hitSlop={8}>
          <ArrowRight size={22} color={COLORS.text} strokeWidth={2.2} />
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Search size={18} color={COLORS.muted} strokeWidth={2.2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="ابحث بالاسم أو الهاتف أو البريد"
          placeholderTextColor={COLORS.muted}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="مسح البحث" onPress={() => setQuery("")}>
            <X size={18} color={COLORS.muted} strokeWidth={2.2} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.filterRow}>
        {BALANCE_FILTERS.map((filter) => {
          const selected = balance === filter.value;
          return (
            <Pressable
              key={filter.value}
              onPress={() => setBalance(filter.value)}
              style={[styles.filterChip, selected && styles.filterChipSelected]}
            >
              <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>{filter.label}</Text>
            </Pressable>
          );
        })}
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
          data={customers}
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
                <Users size={28} color={COLORS.primary} strokeWidth={2} />
              </View>
              <Text style={styles.emptyTitle}>{debouncedQuery ? "لا توجد نتائج" : "لا يوجد عملاء بعد"}</Text>
              <Text style={styles.emptySubtitle}>
                {debouncedQuery ? "جرّب كلمة بحث مختلفة." : "ابدأ بإضافة أول عميل."}
              </Text>
              {!debouncedQuery ? (
                <Pressable style={styles.emptyButton} onPress={() => router.push("/customers/new")}>
                  <Plus size={16} color="#FFFFFF" strokeWidth={2.4} />
                  <Text style={styles.emptyButtonText}>إضافة عميل</Text>
                </Pressable>
              ) : null}
            </View>
          }
          renderItem={({ item }) => {
            const owing = Number(item.outstandingBalance) > 0;
            const credit = Number(item.storeCredit) > 0;
            return (
              <Pressable style={styles.row} onPress={() => router.push(`/customers/${item.id}`)}>
                {owing ? (
                  <View style={[styles.badge, { backgroundColor: COLORS.dangerSoft }]}>
                    <Text style={[styles.badgeText, { color: COLORS.danger }]}>
                      {Number(item.outstandingBalance).toFixed(2)} د.م
                    </Text>
                  </View>
                ) : credit ? (
                  <View style={[styles.badge, { backgroundColor: COLORS.successSoft }]}>
                    <Text style={[styles.badgeText, { color: COLORS.success }]}>
                      رصيد {Number(item.storeCredit).toFixed(2)}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.rowInfo}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {item.phone ?? item.email ?? "—"}
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
  searchWrap: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 18,
    marginBottom: 10,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    textAlign: "right",
  },
  filterRow: {
    flexDirection: "row-reverse",
    gap: 8,
    paddingHorizontal: 18,
    marginBottom: 10,
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
    marginBottom: 6,
  },
  emptySubtitle: {
    color: COLORS.muted,
    fontSize: 13,
    textAlign: "center",
    marginBottom: 20,
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
  name: {
    color: COLORS.text,
    fontSize: 14.5,
    fontWeight: "700",
    textAlign: "right",
  },
  meta: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 3,
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
});
