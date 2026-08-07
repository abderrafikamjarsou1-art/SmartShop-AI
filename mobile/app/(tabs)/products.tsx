import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { router, useLocalSearchParams } from "expo-router";
import { Boxes, Package, Plus, RotateCcw, Search, X } from "lucide-react-native";

import ProductCard from "@/components/products/ProductCard";
import {
  deleteProduct,
  getProducts,
  getProductErrorMessage,
  type Product,
  type ProductFilters,
} from "@/services/products-service";

const STOCK_FILTER_LABELS: Record<NonNullable<ProductFilters["stock"]>, string> = {
  all: "الكل",
  in: "متوفر",
  low: "مخزون منخفض",
  out: "نفدت الكمية",
};

const COLORS = {
  background: "#F7F8FC",
  surface: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  border: "#E9ECF2",
  primary: "#5B5CE2",
  danger: "#DC2626",
};

const PER_PAGE = 20;
const SEARCH_DEBOUNCE_MS = 400;

export default function ProductsScreen() {
  // Deep-linked from the Inventory overview ("منخفض المخزون" / "نفدت الكمية"
  // stat cards): router.push({ pathname: "/products", params: { stock } }).
  const params = useLocalSearchParams<{ stock?: string }>();
  const initialStock = (params.stock as ProductFilters["stock"] | undefined) ?? "all";

  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [stockFilter, setStockFilter] = useState<NonNullable<ProductFilters["stock"]>>(initialStock);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [isLoading, setIsLoading] = useState(true); // initial load
  const [isRefreshing, setIsRefreshing] = useState(false); // pull-to-refresh
  const [isLoadingMore, setIsLoadingMore] = useState(false); // pagination
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Debounce the search box so we don't refetch on every keystroke.
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
        const result = await getProducts({
          q: debouncedQuery || undefined,
          stock: stockFilter === "all" ? undefined : stockFilter,
          page: targetPage,
          perPage: PER_PAGE,
          sortBy: "createdAt",
          sortDir: "desc",
        });

        setProducts((current) => (mode === "more" ? [...current, ...result.items] : result.items));
        setTotal(result.total);
        setPage(result.page);
        setTotalPages(result.totalPages);
      } catch (error) {
        setErrorMessage(getProductErrorMessage(error, "تعذر تحميل المنتجات. حاول مرة أخرى."));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      }
    },
    [debouncedQuery, stockFilter]
  );

  // Reload from page 1 whenever the (debounced) search term or stock filter changes.
  useEffect(() => {
    loadPage(1, "initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, stockFilter]);

  const handleRefresh = useCallback(() => loadPage(1, "refresh"), [loadPage]);

  const handleLoadMore = useCallback(() => {
    if (isLoadingMore || isLoading || page >= totalPages) return;
    loadPage(page + 1, "more");
  }, [isLoadingMore, isLoading, page, totalPages, loadPage]);

  const confirmDelete = useCallback((product: Product) => {
    Alert.alert(
      "حذف المنتج",
      `هل أنت متأكد من حذف "${product.name}"؟ يمكن استعادته لاحقًا من سلة المحذوفات.`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حذف",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteProduct(product.id);
              setProducts((current) => current.filter((p) => p.id !== product.id));
              setTotal((current) => Math.max(0, current - 1));
            } catch (error) {
              Alert.alert("تعذر الحذف", getProductErrorMessage(error, "حدث خطأ أثناء حذف المنتج."));
            }
          },
        },
      ]
    );
  }, []);

  const listRef = useRef<FlatList<Product>>(null);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="إضافة منتج"
            onPress={() => router.push("/products/new")}
            style={styles.addButton}
          >
            <Plus size={22} color="#FFFFFF" strokeWidth={2.4} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="المخزون"
            onPress={() => router.push("/inventory")}
            style={styles.inventoryButton}
          >
            <Boxes size={20} color={COLORS.primary} strokeWidth={2.2} />
          </Pressable>
        </View>

        <View style={styles.headerText}>
          <Text style={styles.title}>المنتجات</Text>
          <Text style={styles.subtitle}>
            {isLoading ? "جارِ التحميل…" : `${total} منتج`}
          </Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Search size={18} color={COLORS.muted} strokeWidth={2.2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="ابحث بالاسم أو SKU أو الباركود"
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

      {stockFilter !== "all" ? (
        <View style={styles.filterBar}>
          <Pressable onPress={() => setStockFilter("all")} style={styles.filterChip}>
            <Text style={styles.filterChipText}>{STOCK_FILTER_LABELS[stockFilter]}</Text>
            <X size={13} color={COLORS.primary} strokeWidth={2.4} />
          </Pressable>
        </View>
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
          ref={listRef}
          data={products}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              onPress={() => router.push(`/products/${item.id}`)}
              onEdit={() => router.push(`/products/${item.id}`)}
              onDelete={() => confirmDelete(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
          }
          onEndReachedThreshold={0.4}
          onEndReached={handleLoadMore}
          ListFooterComponent={
            isLoadingMore ? (
              <View style={styles.footerLoading}>
                <ActivityIndicator color={COLORS.primary} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Package size={28} color={COLORS.primary} strokeWidth={2} />
              </View>
              <Text style={styles.emptyTitle}>
                {debouncedQuery ? "لا توجد نتائج" : "لا توجد منتجات بعد"}
              </Text>
              <Text style={styles.emptySubtitle}>
                {debouncedQuery
                  ? "جرّب كلمة بحث مختلفة."
                  : "ابدأ بإضافة أول منتج في متجرك."}
              </Text>
              {!debouncedQuery ? (
                <Pressable style={styles.emptyButton} onPress={() => router.push("/products/new")}>
                  <Plus size={16} color="#FFFFFF" strokeWidth={2.4} />
                  <Text style={styles.emptyButtonText}>إضافة منتج</Text>
                </Pressable>
              ) : null}
            </View>
          }
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
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerText: {
    alignItems: "flex-end",
  },
  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "800",
    textAlign: "right",
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
    textAlign: "right",
  },
  headerActions: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  addButton: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  inventoryButton: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF0FF",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterBar: {
    flexDirection: "row-reverse",
    paddingHorizontal: 18,
    marginTop: 10,
  },
  filterChip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EEF0FF",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  filterChipText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  searchWrap: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 18,
    marginTop: 14,
    marginBottom: 6,
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
  listContent: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 40,
    flexGrow: 1,
  },
  separator: {
    height: 12,
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
    backgroundColor: "#EEF0FF",
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
    lineHeight: 20,
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
});
