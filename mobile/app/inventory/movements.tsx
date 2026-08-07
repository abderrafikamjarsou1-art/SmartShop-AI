import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { ArrowRight, ClipboardX, RotateCcw, Search, X } from "lucide-react-native";

import {
  getMovements,
  getInventoryErrorMessage,
  type InventoryMovement,
  type MovementType,
} from "@/services/inventory-service";

const COLORS = {
  background: "#F7F8FC",
  surface: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  border: "#E9ECF2",
  primary: "#5B5CE2",
  primarySoft: "#EEF0FF",
  danger: "#DC2626",
  success: "#16A34A",
};

const TYPE_FILTERS: { value: MovementType | "ALL"; label: string }[] = [
  { value: "ALL", label: "الكل" },
  { value: "SALE", label: "بيع" },
  { value: "PURCHASE", label: "شراء" },
  { value: "ADJUSTMENT", label: "تعديل" },
  { value: "RETURN", label: "إرجاع" },
  { value: "INITIAL", label: "ابتدائي" },
];

const TYPE_LABELS: Record<MovementType, string> = {
  SALE: "بيع",
  PURCHASE: "شراء",
  ADJUSTMENT: "تعديل",
  RETURN: "إرجاع",
  INITIAL: "ابتدائي",
};

const PER_PAGE = 20;
const SEARCH_DEBOUNCE_MS = 400;

function formatDateTime(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString("ar-MA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function InventoryMovementsScreen() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<MovementType | "ALL">("ALL");

  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

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
        const result = await getMovements({
          q: debouncedQuery || undefined,
          type: typeFilter === "ALL" ? undefined : typeFilter,
          page: targetPage,
          perPage: PER_PAGE,
        });

        setMovements((current) => (mode === "more" ? [...current, ...result.items] : result.items));
        setTotal(result.total);
        setPage(result.page);
        setTotalPages(result.totalPages);
      } catch (error) {
        setErrorMessage(getInventoryErrorMessage(error, "تعذر تحميل سجل الحركات."));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      }
    },
    [debouncedQuery, typeFilter]
  );

  useEffect(() => {
    loadPage(1, "initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, typeFilter]);

  const handleRefresh = useCallback(() => loadPage(1, "refresh"), [loadPage]);

  const handleLoadMore = useCallback(() => {
    if (isLoadingMore || isLoading || page >= totalPages) return;
    loadPage(page + 1, "more");
  }, [isLoadingMore, isLoading, page, totalPages, loadPage]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} hitSlop={8}>
          <ArrowRight size={22} color={COLORS.text} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.headerTitle}>سجل حركات المخزون</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.searchWrap}>
        <Search size={18} color={COLORS.muted} strokeWidth={2.2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="ابحث بالمنتج أو SKU أو السبب"
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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll} contentContainerStyle={styles.typeScrollContent}>
        {TYPE_FILTERS.map((filter) => {
          const selected = typeFilter === filter.value;
          return (
            <Pressable
              key={filter.value}
              onPress={() => setTypeFilter(filter.value)}
              style={[styles.typeChip, selected && styles.typeChipSelected]}
            >
              <Text style={[styles.typeChipText, selected && styles.typeChipTextSelected]}>{filter.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : errorMessage && movements.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Pressable style={styles.retryButton} onPress={() => loadPage(1, "initial")}>
            <RotateCcw size={16} color="#FFFFFF" strokeWidth={2.4} />
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={styles.countText}>{total} حركة</Text>
          <FlatList
            data={movements}
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
                <ClipboardX size={36} color={COLORS.primary} strokeWidth={1.6} />
                <Text style={styles.emptyTitle}>لا توجد حركات</Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable style={styles.row} onPress={() => router.push(`/products/${item.productId}`)}>
                <Text style={[styles.delta, { color: item.quantity >= 0 ? COLORS.success : COLORS.danger }]}>
                  {item.quantity >= 0 ? `+${item.quantity}` : item.quantity}
                </Text>

                <View style={styles.rowInfo}>
                  <View style={styles.rowTopLine}>
                    <View style={styles.typeBadge}>
                      <Text style={styles.typeBadgeText}>{TYPE_LABELS[item.type]}</Text>
                    </View>
                    <Text style={styles.productName} numberOfLines={1}>
                      {item.product.name}
                    </Text>
                  </View>

                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {item.quantityBefore} ← {item.quantityAfter}
                    {item.reason ? ` · ${item.reason}` : ""}
                  </Text>

                  <Text style={styles.rowFooter}>
                    {formatDateTime(item.createdAt)} · {item.user?.fullName ?? item.user?.email ?? "النظام"}
                  </Text>
                </View>
              </Pressable>
            )}
          />
        </>
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
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
  },
  searchWrap: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 18,
    marginTop: 14,
    paddingHorizontal: 14,
    height: 48,
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
  typeScroll: {
    marginTop: 12,
  },
  typeScrollContent: {
    flexDirection: "row-reverse",
    paddingHorizontal: 18,
    gap: 8,
  },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  typeChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  typeChipText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: COLORS.muted,
  },
  typeChipTextSelected: {
    color: "#FFFFFF",
  },
  countText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "right",
    paddingHorizontal: 18,
    marginTop: 14,
    marginBottom: 4,
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
    paddingTop: 6,
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
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 12,
  },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  delta: {
    fontSize: 14,
    fontWeight: "800",
    minWidth: 36,
    textAlign: "center",
  },
  rowInfo: {
    flex: 1,
    alignItems: "flex-end",
  },
  rowTopLine: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
  },
  typeBadge: {
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  typeBadgeText: {
    color: COLORS.primary,
    fontSize: 10.5,
    fontWeight: "800",
  },
  productName: {
    color: COLORS.text,
    fontSize: 13.5,
    fontWeight: "700",
    flexShrink: 1,
    textAlign: "right",
  },
  rowMeta: {
    color: COLORS.muted,
    fontSize: 11.5,
    marginTop: 4,
    textAlign: "right",
  },
  rowFooter: {
    color: "#9CA3AF",
    fontSize: 10.5,
    marginTop: 3,
    textAlign: "right",
  },
});
