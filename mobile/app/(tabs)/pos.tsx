import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Minus, Plus, Search, ShoppingCart, Trash2, X } from "lucide-react-native";

import ReceiptModal from "@/components/pos/ReceiptModal";
import { getProducts, type Product } from "@/services/products-service";
import {
  createSale,
  generateClientRef,
  getSaleErrorMessage,
  type PaymentMethod,
  type Sale,
} from "@/services/sales-service";

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

type CartLine = {
  product: Product;
  quantity: number;
};

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "نقدًا" },
  { value: "CARD", label: "بطاقة" },
  { value: "BANK_TRANSFER", label: "تحويل بنكي" },
];

const SEARCH_DEBOUNCE_MS = 350;

export default function PosScreen() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);

  const [cart, setCart] = useState<CartLine[]>([]);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [amountTendered, setAmountTendered] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [completedSale, setCompletedSale] = useState<Sale | null>(null);

  // Stable per-checkout-attempt idempotency key: generated once when
  // checkout starts, reused across retries of the SAME attempt so a
  // dropped-connection retry can never double-charge, reset after success.
  const clientRefRef = useRef<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!debouncedQuery) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    getProducts({ q: debouncedQuery, status: "ACTIVE", stock: "in", perPage: 15, sortBy: "name", sortDir: "asc" })
      .then((result) => {
        if (!cancelled) setSearchResults(result.items);
      })
      .catch(() => {
        if (!cancelled) setSearchResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + Number(line.product.sellingPrice) * line.quantity, 0),
    [cart]
  );

  const addToCart = useCallback((product: Product) => {
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.quantity) {
          Alert.alert("الكمية غير متوفرة", `الكمية المتوفرة من "${product.name}" هي ${product.quantity} فقط.`);
          return current;
        }
        return current.map((line) =>
          line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line
        );
      }
      if (product.quantity <= 0) {
        Alert.alert("نفد المخزون", `"${product.name}" غير متوفر حاليًا.`);
        return current;
      }
      return [...current, { product, quantity: 1 }];
    });
    setQuery("");
    setSearchResults([]);
    Keyboard.dismiss();
  }, []);

  function changeQuantity(productId: string, delta: number) {
    setCart((current) =>
      current
        .map((line) => {
          if (line.product.id !== productId) return line;
          const nextQuantity = line.quantity + delta;
          if (nextQuantity > line.product.quantity) {
            Alert.alert("الكمية غير متوفرة", `الكمية المتوفرة هي ${line.product.quantity} فقط.`);
            return line;
          }
          return { ...line, quantity: nextQuantity };
        })
        .filter((line) => line.quantity > 0)
    );
  }

  function removeFromCart(productId: string) {
    setCart((current) => current.filter((line) => line.product.id !== productId));
  }

  function clearCart() {
    setCart([]);
    setAmountTendered("");
    clientRefRef.current = null;
  }

  async function handleCheckout() {
    if (cart.length === 0 || submitting) return;

    const amount = Number(amountTendered);
    if (!amountTendered.trim() || !Number.isFinite(amount) || amount <= 0) {
      setErrorMessage("أدخل المبلغ المستلم.");
      return;
    }

    if (!clientRefRef.current) clientRefRef.current = generateClientRef();

    try {
      setSubmitting(true);
      setErrorMessage(null);

      const sale = await createSale({
        clientRef: clientRefRef.current,
        status: "COMPLETED",
        items: cart.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
        payments: [{ method: paymentMethod, amount }],
      });

      setCompletedSale(sale);
      clearCart();
    } catch (error) {
      setErrorMessage(getSaleErrorMessage(error, "تعذر إتمام عملية البيع. حاول مرة أخرى."));
    } finally {
      setSubmitting(false);
    }
  }

  const showingSearch = debouncedQuery.length > 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <View style={styles.cartBadge}>
          <ShoppingCart size={16} color={COLORS.primary} strokeWidth={2.2} />
          <Text style={styles.cartBadgeText}>{cart.length}</Text>
        </View>
        <Text style={styles.title}>نقطة البيع</Text>
      </View>

      <View style={styles.searchWrap}>
        <Search size={18} color={COLORS.muted} strokeWidth={2.2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="ابحث بالاسم أو SKU أو امسح الباركود"
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

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {showingSearch ? (
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              searching ? (
                <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} />
              ) : (
                <Text style={styles.emptyText}>لا توجد نتائج</Text>
              )
            }
            renderItem={({ item }) => (
              <Pressable style={styles.resultRow} onPress={() => addToCart(item)}>
                <View style={styles.resultAdd}>
                  <Plus size={16} color="#FFFFFF" strokeWidth={2.6} />
                </View>
                <View style={styles.resultInfo}>
                  <Text style={styles.resultName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.resultMeta}>
                    {Number(item.sellingPrice).toFixed(2)} د.م · متوفر {item.quantity}
                  </Text>
                </View>
              </Pressable>
            )}
          />
        ) : (
          <>
            <FlatList
              data={cart}
              keyExtractor={(line) => line.product.id}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={styles.emptyCart}>
                  <ShoppingCart size={40} color={COLORS.primary} strokeWidth={1.6} />
                  <Text style={styles.emptyTitle}>السلة فارغة</Text>
                  <Text style={styles.emptySubtitle}>ابحث عن منتج لإضافته إلى السلة.</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.cartRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="حذف من السلة"
                    onPress={() => removeFromCart(item.product.id)}
                    hitSlop={8}
                  >
                    <Trash2 size={17} color={COLORS.danger} strokeWidth={2.2} />
                  </Pressable>

                  <Text style={styles.cartLineTotal}>
                    {(Number(item.product.sellingPrice) * item.quantity).toFixed(2)}
                  </Text>

                  <View style={styles.qtyStepper}>
                    <Pressable style={styles.qtyButton} onPress={() => changeQuantity(item.product.id, 1)}>
                      <Plus size={13} color={COLORS.primary} strokeWidth={2.6} />
                    </Pressable>
                    <Text style={styles.qtyValue}>{item.quantity}</Text>
                    <Pressable style={styles.qtyButton} onPress={() => changeQuantity(item.product.id, -1)}>
                      <Minus size={13} color={COLORS.primary} strokeWidth={2.6} />
                    </Pressable>
                  </View>

                  <View style={styles.cartInfo}>
                    <Text style={styles.cartName} numberOfLines={1}>
                      {item.product.name}
                    </Text>
                    <Text style={styles.cartUnitPrice}>
                      {Number(item.product.sellingPrice).toFixed(2)} د.م / وحدة
                    </Text>
                  </View>
                </View>
              )}
            />

            {cart.length > 0 ? (
              <View style={styles.checkoutPanel}>
                <View style={styles.subtotalRow}>
                  <Text style={styles.subtotalValue}>{subtotal.toFixed(2)} د.م</Text>
                  <Text style={styles.subtotalLabel}>المجموع</Text>
                </View>

                <View style={styles.methodRow}>
                  {PAYMENT_METHODS.map((method) => {
                    const selected = paymentMethod === method.value;
                    return (
                      <Pressable
                        key={method.value}
                        onPress={() => setPaymentMethod(method.value)}
                        style={[styles.methodPill, selected && styles.methodPillSelected]}
                      >
                        <Text style={[styles.methodText, selected && styles.methodTextSelected]}>
                          {method.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.amountRow}>
                  <TextInput
                    value={amountTendered}
                    onChangeText={setAmountTendered}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={COLORS.muted}
                    style={styles.amountInput}
                  />
                  <Pressable style={styles.exactButton} onPress={() => setAmountTendered(subtotal.toFixed(2))}>
                    <Text style={styles.exactButtonText}>المبلغ بالكامل</Text>
                  </Pressable>
                </View>

                {paymentMethod === "CASH" && Number(amountTendered) > subtotal ? (
                  <Text style={styles.changeHint}>
                    الباقي للعميل: {(Number(amountTendered) - subtotal).toFixed(2)} د.م
                  </Text>
                ) : null}

                {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

                <Pressable
                  style={[styles.payButton, submitting && styles.payButtonDisabled]}
                  disabled={submitting}
                  onPress={handleCheckout}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.payButtonText}>إتمام البيع</Text>
                  )}
                </Pressable>
              </View>
            ) : null}
          </>
        )}
      </KeyboardAvoidingView>

      <ReceiptModal sale={completedSale} onClose={() => setCompletedSale(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 4,
  },
  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "800",
  },
  cartBadge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  cartBadgeText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 13,
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
    paddingTop: 10,
    paddingBottom: 20,
    flexGrow: 1,
  },
  emptyText: {
    color: COLORS.muted,
    textAlign: "center",
    marginTop: 24,
    fontSize: 13,
  },
  resultRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  resultAdd: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  resultInfo: {
    flex: 1,
    alignItems: "flex-end",
  },
  resultName: {
    color: COLORS.text,
    fontSize: 14.5,
    fontWeight: "700",
    textAlign: "right",
  },
  resultMeta: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 3,
  },
  emptyCart: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 14,
  },
  emptySubtitle: {
    color: COLORS.muted,
    fontSize: 13,
    marginTop: 6,
  },
  cartRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  cartInfo: {
    flex: 1,
    alignItems: "flex-end",
  },
  cartName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "right",
  },
  cartUnitPrice: {
    color: COLORS.muted,
    fontSize: 11.5,
    marginTop: 2,
  },
  qtyStepper: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primarySoft,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  qtyButton: {
    width: 22,
    height: 22,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
  },
  qtyValue: {
    minWidth: 18,
    textAlign: "center",
    fontWeight: "800",
    color: COLORS.text,
    fontSize: 13,
  },
  cartLineTotal: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 14,
    minWidth: 56,
    textAlign: "left",
  },
  checkoutPanel: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 18,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  subtotalRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  subtotalLabel: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  subtotalValue: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "800",
  },
  methodRow: {
    flexDirection: "row-reverse",
    gap: 8,
    marginBottom: 12,
  },
  methodPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  methodPillSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  methodText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: COLORS.muted,
  },
  methodTextSelected: {
    color: "#FFFFFF",
  },
  amountRow: {
    flexDirection: "row-reverse",
    gap: 8,
    marginBottom: 8,
  },
  amountInput: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "right",
  },
  exactButton: {
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: COLORS.primarySoft,
  },
  exactButtonText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  changeHint: {
    color: COLORS.success,
    fontSize: 12.5,
    fontWeight: "700",
    textAlign: "right",
    marginBottom: 8,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 12.5,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 10,
  },
  payButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  payButtonDisabled: {
    opacity: 0.6,
  },
  payButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});
