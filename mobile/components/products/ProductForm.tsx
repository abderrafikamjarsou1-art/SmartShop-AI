import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Check, PackagePlus } from "lucide-react-native";
import type { ProductCategory, ProductStatus, ProductSupplier } from "@/services/products-service";

export type ProductFormValues = {
  name: string;
  sku: string;
  barcode: string;
  buyingPrice: string;
  sellingPrice: string;
  quantity: string;
  minimumStock: string;
  status: ProductStatus;
  allowLoss: boolean;
  categoryId: string | null;
  supplierId: string | null;
};

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  name: "",
  sku: "",
  barcode: "",
  buyingPrice: "",
  sellingPrice: "",
  quantity: "0",
  minimumStock: "0",
  status: "ACTIVE",
  allowLoss: false,
  categoryId: null,
  supplierId: null,
};

const STATUS_OPTIONS: { value: ProductStatus; label: string }[] = [
  { value: "ACTIVE", label: "نشط" },
  { value: "INACTIVE", label: "غير نشط" },
  { value: "DISCONTINUED", label: "متوقف" },
];

const COLORS = {
  text: "#111827",
  muted: "#6B7280",
  border: "#E9ECF2",
  primary: "#5B5CE2",
  primarySoft: "#EEF0FF",
  danger: "#DC2626",
  surface: "#FFFFFF",
  fieldBg: "#F8FAFC",
};

type Props = {
  values: ProductFormValues;
  onChange: (values: ProductFormValues) => void;
  fieldErrors?: Record<string, string[]>;
  submitting: boolean;
  submitLabel: string;
  onSubmit: () => void;
  /** Edit mode only: quantity is read-only here — stock changes go through adjustStock. */
  quantityReadOnly?: boolean;
  onAdjustStockPress?: () => void;
  categories?: ProductCategory[];
  suppliers?: ProductSupplier[];
};

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages || messages.length === 0) return null;
  return <Text style={styles.fieldError}>{messages[0]}</Text>;
}

function ChipPicker<T extends { id: string; name: string }>({
  label,
  options,
  selectedId,
  onSelect,
}: {
  label: string;
  options: T[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  if (options.length === 0) return null;

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
        <Pressable
          onPress={() => onSelect(null)}
          style={[styles.chip, selectedId === null && styles.chipSelected]}
        >
          <Text style={[styles.chipText, selectedId === null && styles.chipTextSelected]}>بدون</Text>
        </Pressable>
        {options.map((option) => {
          const selected = selectedId === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => onSelect(option.id)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
                {option.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function ProductForm({
  values,
  onChange,
  fieldErrors,
  submitting,
  submitLabel,
  onSubmit,
  quantityReadOnly = false,
  onAdjustStockPress,
  categories = [],
  suppliers = [],
}: Props) {
  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) =>
    onChange({ ...values, [key]: value });

  const isNameValid = values.name.trim().length > 0;
  const isBuyingPriceValid = values.buyingPrice.trim().length > 0 && Number.isFinite(Number(values.buyingPrice));
  const isSellingPriceValid = values.sellingPrice.trim().length > 0 && Number.isFinite(Number(values.sellingPrice));
  const canSubmit = isNameValid && isBuyingPriceValid && isSellingPriceValid && !submitting;

  return (
    <View>
      <View style={styles.field}>
        <Text style={styles.label}>اسم المنتج *</Text>
        <TextInput
          value={values.name}
          onChangeText={(v) => set("name", v)}
          style={styles.input}
          placeholder="مثال: قهوة عربية 250غ"
          placeholderTextColor={COLORS.muted}
        />
        <FieldError messages={fieldErrors?.name} />
      </View>

      <View style={styles.row}>
        <View style={[styles.field, styles.halfField]}>
          <Text style={styles.label}>SKU</Text>
          <TextInput
            value={values.sku}
            onChangeText={(v) => set("sku", v)}
            style={styles.input}
            placeholder="اختياري"
            placeholderTextColor={COLORS.muted}
            autoCapitalize="characters"
          />
          <FieldError messages={fieldErrors?.sku} />
        </View>

        <View style={[styles.field, styles.halfField]}>
          <Text style={styles.label}>الباركود</Text>
          <TextInput
            value={values.barcode}
            onChangeText={(v) => set("barcode", v)}
            style={styles.input}
            placeholder="اختياري"
            placeholderTextColor={COLORS.muted}
            keyboardType="number-pad"
          />
          <FieldError messages={fieldErrors?.barcode} />
        </View>
      </View>

      <View style={styles.row}>
        <View style={[styles.field, styles.halfField]}>
          <Text style={styles.label}>سعر الشراء *</Text>
          <TextInput
            value={values.buyingPrice}
            onChangeText={(v) => set("buyingPrice", v)}
            style={styles.input}
            placeholder="0.00"
            placeholderTextColor={COLORS.muted}
            keyboardType="decimal-pad"
          />
          <FieldError messages={fieldErrors?.buyingPrice} />
        </View>

        <View style={[styles.field, styles.halfField]}>
          <Text style={styles.label}>سعر البيع *</Text>
          <TextInput
            value={values.sellingPrice}
            onChangeText={(v) => set("sellingPrice", v)}
            style={styles.input}
            placeholder="0.00"
            placeholderTextColor={COLORS.muted}
            keyboardType="decimal-pad"
          />
          <FieldError messages={fieldErrors?.sellingPrice} />
        </View>
      </View>

      <Pressable style={styles.allowLossRow} onPress={() => set("allowLoss", !values.allowLoss)}>
        <View style={[styles.checkbox, values.allowLoss && styles.checkboxChecked]}>
          {values.allowLoss ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}
        </View>
        <Text style={styles.allowLossLabel}>السماح بالبيع بسعر أقل من التكلفة</Text>
      </Pressable>
      <FieldError messages={fieldErrors?.sellingPrice?.filter((m) => m.toLowerCase().includes("loss") || m.includes("خسارة"))} />

      <View style={styles.row}>
        <View style={[styles.field, styles.halfField]}>
          <Text style={styles.label}>{quantityReadOnly ? "الكمية الحالية" : "الكمية الابتدائية"}</Text>
          {quantityReadOnly ? (
            <Pressable style={[styles.input, styles.quantityReadOnly]} onPress={onAdjustStockPress}>
              <Text style={styles.quantityReadOnlyText}>{values.quantity}</Text>
              <View style={styles.adjustPill}>
                <PackagePlus size={13} color={COLORS.primary} strokeWidth={2.4} />
                <Text style={styles.adjustPillText}>تعديل</Text>
              </View>
            </Pressable>
          ) : (
            <TextInput
              value={values.quantity}
              onChangeText={(v) => set("quantity", v)}
              style={styles.input}
              placeholder="0"
              placeholderTextColor={COLORS.muted}
              keyboardType="number-pad"
            />
          )}
          <FieldError messages={fieldErrors?.quantity} />
        </View>

        <View style={[styles.field, styles.halfField]}>
          <Text style={styles.label}>الحد الأدنى للمخزون</Text>
          <TextInput
            value={values.minimumStock}
            onChangeText={(v) => set("minimumStock", v)}
            style={styles.input}
            placeholder="0"
            placeholderTextColor={COLORS.muted}
            keyboardType="number-pad"
          />
          <FieldError messages={fieldErrors?.minimumStock} />
        </View>
      </View>

      <ChipPicker
        label="الفئة"
        options={categories}
        selectedId={values.categoryId}
        onSelect={(id) => set("categoryId", id)}
      />

      <ChipPicker
        label="المورد"
        options={suppliers}
        selectedId={values.supplierId}
        onSelect={(id) => set("supplierId", id)}
      />

      <View style={styles.field}>
        <Text style={styles.label}>الحالة</Text>
        <View style={styles.statusRow}>
          {STATUS_OPTIONS.map((option) => {
            const selected = values.status === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => set("status", option.value)}
                style={[styles.statusPill, selected && styles.statusPillSelected]}
              >
                <Text style={[styles.statusPillText, selected && styles.statusPillTextSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable
        onPress={onSubmit}
        disabled={!canSubmit}
        style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
      >
        {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>{submitLabel}</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    marginBottom: 16,
  },
  row: {
    flexDirection: "row-reverse",
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  label: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.fieldBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.text,
    textAlign: "right",
  },
  fieldError: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 5,
    textAlign: "right",
  },
  allowLossRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    marginBottom: 18,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  allowLossLabel: {
    color: COLORS.muted,
    fontSize: 12.5,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
  },
  quantityReadOnly: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  quantityReadOnlyText: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.text,
  },
  adjustPill: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  adjustPillText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "700",
  },
  chipScroll: {
    flexDirection: "row-reverse",
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: COLORS.fieldBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginLeft: 8,
  },
  chipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: COLORS.muted,
  },
  chipTextSelected: {
    color: "#FFFFFF",
  },
  statusRow: {
    flexDirection: "row-reverse",
    gap: 8,
  },
  statusPill: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: COLORS.fieldBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusPillSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  statusPillText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: COLORS.muted,
  },
  statusPillTextSelected: {
    color: "#FFFFFF",
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});
