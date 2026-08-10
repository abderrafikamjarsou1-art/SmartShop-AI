import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowRight, RotateCcw, Trash2 } from "lucide-react-native";

import ProductForm, { type ProductFormValues } from "@/components/products/ProductForm";
import StockAdjustmentModal from "@/components/products/StockAdjustmentModal";
import {
  deleteProduct,
  getProduct,
  getProductErrorMessage,
  getProductFieldErrors,
  getProductOptions,
  updateProduct,
  type Product,
  type ProductOptions,
  type UpdateProductInput,
} from "@/services/products-service";

const COLORS = {
  background: "#F7F8FC",
  surface: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  border: "#E9ECF2",
  primary: "#5B5CE2",
  danger: "#DC2626",
  dangerSoft: "#FEF2F2",
};

function productToFormValues(product: Product): ProductFormValues {
  return {
    name: product.name,
    sku: product.sku ?? "",
    barcode: product.barcode ?? "",
    buyingPrice: product.buyingPrice,
    sellingPrice: product.sellingPrice,
    quantity: String(product.quantity),
    minimumStock: String(product.minimumStock),
    status: product.status,
    allowLoss: true, // editing an already-saved product must never re-block on the margin rule
    categoryId: product.categoryId,
    supplierId: product.supplierId,
  };
}

function toUpdateInput(values: ProductFormValues): UpdateProductInput {
  return {
    name: values.name.trim(),
    sku: values.sku.trim() || undefined,
    barcode: values.barcode.trim() || undefined,
    buyingPrice: Number(values.buyingPrice),
    sellingPrice: Number(values.sellingPrice),
    // Read-only in this form (see ProductForm's quantityReadOnly) — passed
    // through unchanged because the server schema still requires it, even
    // though productService.update() never writes it. Use adjustStock to
    // actually change quantity.
    quantity: Number(values.quantity),
    minimumStock: Number(values.minimumStock) || 0,
    status: values.status,
    allowLoss: values.allowLoss,
    categoryId: values.categoryId ?? undefined,
    supplierId: values.supplierId ?? undefined,
  };
}

export default function EditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [product, setProduct] = useState<Product | null>(null);
  const [values, setValues] = useState<ProductFormValues | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [stockModalVisible, setStockModalVisible] = useState(false);
  const [options, setOptions] = useState<ProductOptions>({ categories: [], suppliers: [] });

  useEffect(() => {
    getProductOptions()
      .then(setOptions)
      .catch(() => {
        /* pickers just stay empty ("بدون" only) if this fails — not fatal to the form */
      });
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await getProduct(id);
      setProduct(result);
      setValues(productToFormValues(result));
    } catch (error) {
      setLoadError(getProductErrorMessage(error, "تعذر تحميل بيانات المنتج."));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit() {
    if (!values || !product || submitting) return;

    try {
      setSubmitting(true);
      setErrorMessage(null);
      setFieldErrors({});

      await updateProduct(product.id, toUpdateInput(values));

      Alert.alert("تم بنجاح", "تم حفظ التعديلات بنجاح.", [
        { text: "حسنًا", onPress: () => router.back() },
      ]);
    } catch (error) {
      setFieldErrors(getProductFieldErrors(error));
      setErrorMessage(getProductErrorMessage(error, "تعذر حفظ التعديلات. تحقق من البيانات وحاول مجددًا."));
    } finally {
      setSubmitting(false);
    }
  }

  function handleDelete() {
    if (!product) return;
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
              router.back();
            } catch (error) {
              Alert.alert("تعذر الحذف", getProductErrorMessage(error, "حدث خطأ أثناء حذف المنتج."));
            }
          },
        },
      ]
    );
  }

  function handleAdjusted(updated: Product) {
    setProduct(updated);
    setValues((current) => (current ? { ...current, quantity: String(updated.quantity) } : current));
    setStockModalVisible(false);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} hitSlop={8}>
          <ArrowRight size={22} color={COLORS.text} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {product?.name ?? "تعديل المنتج"}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="حذف المنتج"
          onPress={handleDelete}
          hitSlop={8}
          style={styles.deleteButton}
          disabled={!product}
        >
          <Trash2 size={19} color={COLORS.danger} strokeWidth={2.2} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : loadError ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{loadError}</Text>
          <Pressable style={styles.retryButton} onPress={load}>
            <RotateCcw size={16} color="#FFFFFF" strokeWidth={2.4} />
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </Pressable>
        </View>
      ) : values && product ? (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {errorMessage ? <Text style={styles.errorBanner}>{errorMessage}</Text> : null}

            <ProductForm
              values={values}
              onChange={setValues}
              fieldErrors={fieldErrors}
              submitting={submitting}
              submitLabel="حفظ التعديلات"
              onSubmit={handleSubmit}
              quantityReadOnly
              onAdjustStockPress={() => setStockModalVisible(true)}
              categories={options.categories}
              suppliers={options.suppliers}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      ) : null}

      {product ? (
        <StockAdjustmentModal
          visible={stockModalVisible}
          product={product}
          onClose={() => setStockModalVisible(false)}
          onAdjusted={handleAdjusted}
        />
      ) : null}
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
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  headerTitle: {
    flex: 1,
    marginHorizontal: 12,
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "800",
    textAlign: "right",
  },
  deleteButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.dangerSoft,
  },
  content: {
    padding: 18,
    paddingBottom: 48,
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
  errorBanner: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 20,
  },
});
