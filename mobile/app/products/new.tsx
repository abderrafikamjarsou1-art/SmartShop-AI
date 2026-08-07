import { useEffect, useState } from "react";
import {
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
import { router } from "expo-router";
import { ArrowRight } from "lucide-react-native";

import ProductForm, { EMPTY_PRODUCT_FORM, type ProductFormValues } from "@/components/products/ProductForm";
import {
  createProduct,
  getProductErrorMessage,
  getProductFieldErrors,
  getProductOptions,
  type CreateProductInput,
  type ProductOptions,
} from "@/services/products-service";

const COLORS = {
  background: "#F7F8FC",
  surface: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  border: "#E9ECF2",
  danger: "#DC2626",
};

function toCreateInput(values: ProductFormValues): CreateProductInput {
  return {
    name: values.name.trim(),
    sku: values.sku.trim() || undefined,
    barcode: values.barcode.trim() || undefined,
    buyingPrice: Number(values.buyingPrice),
    sellingPrice: Number(values.sellingPrice),
    quantity: Number(values.quantity) || 0,
    minimumStock: Number(values.minimumStock) || 0,
    status: values.status,
    allowLoss: values.allowLoss,
    categoryId: values.categoryId ?? undefined,
    supplierId: values.supplierId ?? undefined,
  };
}

export default function NewProductScreen() {
  const [values, setValues] = useState<ProductFormValues>(EMPTY_PRODUCT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [options, setOptions] = useState<ProductOptions>({ categories: [], suppliers: [] });

  useEffect(() => {
    getProductOptions()
      .then(setOptions)
      .catch(() => {
        /* pickers just stay empty ("بدون" only) if this fails — not fatal to the form */
      });
  }, []);

  async function handleSubmit() {
    if (submitting) return; // submit protection: prevent double-tap re-entry

    try {
      setSubmitting(true);
      setErrorMessage(null);
      setFieldErrors({});

      await createProduct(toCreateInput(values));

      Alert.alert("تم بنجاح", "تم إنشاء المنتج بنجاح.", [
        { text: "حسنًا", onPress: () => router.back() },
      ]);
    } catch (error) {
      setFieldErrors(getProductFieldErrors(error));
      setErrorMessage(getProductErrorMessage(error, "تعذر إنشاء المنتج. تحقق من البيانات وحاول مجددًا."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} hitSlop={8}>
          <ArrowRight size={22} color={COLORS.text} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.headerTitle}>منتج جديد</Text>
        <View style={{ width: 22 }} />
      </View>

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
            submitLabel="إنشاء المنتج"
            onSubmit={handleSubmit}
            categories={options.categories}
            suppliers={options.suppliers}
          />
        </ScrollView>
      </KeyboardAvoidingView>
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
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "800",
  },
  content: {
    padding: 18,
    paddingBottom: 48,
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
