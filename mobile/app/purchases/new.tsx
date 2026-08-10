import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { ArrowRight, Check, ChevronDown, Plus, Search, Trash2 } from "lucide-react-native";

import {
  createPurchase,
  getPurchaseErrorMessage,
  getPurchaseFieldErrors,
  getPurchaseOptions,
  type PurchaseOptions,
} from "@/services/purchases-service";

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
};

type DraftLine = {
  key: string;
  productId: string;
  productName: string;
  productSku: string | null;
  quantity: string;
  unitCost: string;
};

let keySeed = 0;
function nextKey() {
  keySeed += 1;
  return `line-${keySeed}`;
}

export default function NewPurchaseScreen() {
  const [options, setOptions] = useState<PurchaseOptions | null>(null);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [notes, setNotes] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getPurchaseOptions();
        if (!cancelled) setOptions(result);
      } catch (error) {
        if (!cancelled) setOptionsError(getPurchaseErrorMessage(error, "تعذر تحميل بيانات النموذج."));
      } finally {
        if (!cancelled) setIsLoadingOptions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedSupplier = useMemo(
    () => options?.suppliers.find((s) => s.id === supplierId) ?? null,
    [options, supplierId]
  );

  const filteredProducts = useMemo(() => {
    if (!options) return [];
    const q = productSearch.trim().toLowerCase();
    if (!q) return options.products;
    return options.products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q)
    );
  }, [options, productSearch]);

  const total = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const qty = Number(line.quantity) || 0;
        const cost = Number(line.unitCost) || 0;
        return sum + qty * cost;
      }, 0),
    [lines]
  );

  function addProduct(productId: string, name: string, sku: string | null, buyingPrice: number) {
    setLines((current) => {
      if (current.some((l) => l.productId === productId)) return current;
      return [
        ...current,
        {
          key: nextKey(),
          productId,
          productName: name,
          productSku: sku,
          quantity: "1",
          unitCost: String(buyingPrice ?? 0),
        },
      ];
    });
    setProductPickerOpen(false);
    setProductSearch("");
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((l) => l.key !== key));
  }

  async function handleSubmit(status: "DRAFT" | "ORDERED") {
    setFieldErrors({});

    if (!supplierId) {
      Alert.alert("الحقول ناقصة", "الرجاء اختيار المورد.");
      return;
    }
    if (lines.length === 0) {
      Alert.alert("الحقول ناقصة", "الرجاء إضافة منتج واحد على الأقل.");
      return;
    }

    setIsSaving(true);
    try {
      const purchase = await createPurchase({
        supplierId,
        status,
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: Number(l.quantity) || 0,
          unitCost: Number(l.unitCost) || 0,
        })),
        notes: notes.trim() || undefined,
      });
      router.replace(`/purchases/${purchase.id}`);
    } catch (error) {
      setFieldErrors(getPurchaseFieldErrors(error));
      Alert.alert("تعذر الحفظ", getPurchaseErrorMessage(error, "حدث خطأ غير متوقع."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="إلغاء" onPress={() => router.back()} hitSlop={8}>
            <ArrowRight size={22} color={COLORS.text} strokeWidth={2.2} />
          </Pressable>
          <Text style={styles.title}>طلب شراء جديد</Text>
          <View style={{ width: 22 }} />
        </View>

        {isLoadingOptions ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={COLORS.primary} size="large" />
          </View>
        ) : optionsError ? (
          <View style={styles.centerState}>
            <Text style={styles.errorText}>{optionsError}</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionLabel}>المورد</Text>
            <Pressable style={styles.selectField} onPress={() => setSupplierPickerOpen(true)}>
              <ChevronDown size={18} color={COLORS.muted} strokeWidth={2.2} />
              <Text style={[styles.selectFieldText, !selectedSupplier && styles.placeholderText]}>
                {selectedSupplier?.name ?? "اختر المورد"}
              </Text>
            </Pressable>
            {fieldErrors.supplierId ? <Text style={styles.fieldError}>{fieldErrors.supplierId[0]}</Text> : null}

            <View style={styles.sectionHeaderRow}>
              <Pressable style={styles.addLineButton} onPress={() => setProductPickerOpen(true)}>
                <Plus size={15} color={COLORS.primary} strokeWidth={2.4} />
                <Text style={styles.addLineButtonText}>إضافة منتج</Text>
              </Pressable>
              <Text style={styles.sectionLabel}>المنتجات ({lines.length})</Text>
            </View>

            {lines.length === 0 ? (
              <View style={styles.emptyLines}>
                <Text style={styles.emptyLinesText}>لم تتم إضافة منتجات بعد</Text>
              </View>
            ) : (
              lines.map((line) => (
                <View key={line.key} style={styles.lineCard}>
                  <Pressable onPress={() => removeLine(line.key)} hitSlop={8}>
                    <Trash2 size={18} color={COLORS.danger} strokeWidth={2} />
                  </Pressable>

                  <View style={styles.lineInfo}>
                    <Text style={styles.lineName} numberOfLines={1}>
                      {line.productName}
                    </Text>
                    {line.productSku ? <Text style={styles.lineSku}>{line.productSku}</Text> : null}

                    <View style={styles.lineInputsRow}>
                      <View style={styles.lineInputGroup}>
                        <Text style={styles.lineInputLabel}>الكمية</Text>
                        <TextInput
                          value={line.quantity}
                          onChangeText={(v) => updateLine(line.key, { quantity: v.replace(/[^0-9]/g, "") })}
                          keyboardType="number-pad"
                          style={styles.lineInput}
                          textAlign="right"
                        />
                      </View>
                      <View style={styles.lineInputGroup}>
                        <Text style={styles.lineInputLabel}>سعر التكلفة</Text>
                        <TextInput
                          value={line.unitCost}
                          onChangeText={(v) => updateLine(line.key, { unitCost: v.replace(/[^0-9.]/g, "") })}
                          keyboardType="decimal-pad"
                          style={styles.lineInput}
                          textAlign="right"
                        />
                      </View>
                    </View>
                  </View>
                </View>
              ))
            )}

            <Text style={styles.sectionLabel}>ملاحظات (اختياري)</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="ملاحظات حول الطلب"
              placeholderTextColor={COLORS.muted}
              style={styles.notesInput}
              multiline
              textAlign="right"
            />

            <View style={styles.totalRow}>
              <Text style={styles.totalValue}>{total.toFixed(2)} د.م</Text>
              <Text style={styles.totalLabel}>الإجمالي التقديري</Text>
            </View>
          </ScrollView>
        )}

        {!isLoadingOptions && !optionsError ? (
          <View style={styles.footer}>
            <Pressable
              style={[styles.footerButton, styles.footerButtonPrimary, isSaving && styles.footerButtonDisabled]}
              disabled={isSaving}
              onPress={() => handleSubmit("ORDERED")}
            >
              {isSaving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.footerButtonPrimaryText}>حفظ وإرسال للمورد</Text>}
            </Pressable>
            <Pressable
              style={[styles.footerButton, styles.footerButtonSecondary, isSaving && styles.footerButtonDisabled]}
              disabled={isSaving}
              onPress={() => handleSubmit("DRAFT")}
            >
              <Text style={styles.footerButtonSecondaryText}>حفظ كمسودة</Text>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <Modal visible={supplierPickerOpen} animationType="slide" transparent onRequestClose={() => setSupplierPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSupplierPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>اختر المورد</Text>
            <ScrollView style={styles.modalList}>
              {(options?.suppliers ?? []).map((supplier) => (
                <Pressable
                  key={supplier.id}
                  style={styles.modalRow}
                  onPress={() => {
                    setSupplierId(supplier.id);
                    setSupplierPickerOpen(false);
                  }}
                >
                  <Text style={styles.modalRowText}>{supplier.name}</Text>
                  {supplierId === supplier.id ? <Check size={18} color={COLORS.primary} strokeWidth={2.4} /> : null}
                </Pressable>
              ))}
              {(options?.suppliers ?? []).length === 0 ? (
                <Text style={styles.modalEmptyText}>لا يوجد موردون بعد</Text>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={productPickerOpen} animationType="slide" transparent onRequestClose={() => setProductPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setProductPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>اختر منتجًا</Text>
            <View style={styles.searchRow}>
              <Search size={16} color={COLORS.muted} strokeWidth={2.2} />
              <TextInput
                value={productSearch}
                onChangeText={setProductSearch}
                placeholder="ابحث عن منتج"
                placeholderTextColor={COLORS.muted}
                style={styles.searchInput}
                textAlign="right"
              />
            </View>
            <ScrollView style={styles.modalList}>
              {filteredProducts.map((product) => {
                const alreadyAdded = lines.some((l) => l.productId === product.id);
                return (
                  <Pressable
                    key={product.id}
                    style={[styles.modalRow, alreadyAdded && styles.modalRowDisabled]}
                    disabled={alreadyAdded}
                    onPress={() => addProduct(product.id, product.name, product.sku, product.buyingPrice)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalRowText}>{product.name}</Text>
                      {product.sku ? <Text style={styles.modalRowSubtext}>{product.sku}</Text> : null}
                    </View>
                    {alreadyAdded ? <Check size={18} color={COLORS.muted} strokeWidth={2.4} /> : null}
                  </Pressable>
                );
              })}
              {filteredProducts.length === 0 ? <Text style={styles.modalEmptyText}>لا توجد نتائج</Text> : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
  title: { color: COLORS.text, fontSize: 17, fontWeight: "800" },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  errorText: { color: COLORS.danger, fontSize: 14, fontWeight: "600", textAlign: "center" },
  content: { paddingHorizontal: 18, paddingBottom: 40 },
  sectionLabel: {
    color: COLORS.text,
    fontSize: 13.5,
    fontWeight: "800",
    textAlign: "right",
    marginTop: 18,
    marginBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  addLineButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    marginTop: 14,
  },
  addLineButtonText: { color: COLORS.primary, fontSize: 12, fontWeight: "700" },
  selectField: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  selectFieldText: { color: COLORS.text, fontSize: 14.5, fontWeight: "600" },
  placeholderText: { color: COLORS.muted, fontWeight: "500" },
  fieldError: { color: COLORS.danger, fontSize: 12, textAlign: "right", marginTop: 6 },
  emptyLines: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyLinesText: { color: COLORS.muted, fontSize: 13, fontWeight: "600" },
  lineCard: {
    flexDirection: "row-reverse",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 13,
    marginBottom: 10,
    gap: 10,
  },
  lineInfo: { flex: 1 },
  lineName: { color: COLORS.text, fontSize: 14, fontWeight: "700", textAlign: "right" },
  lineSku: { color: COLORS.muted, fontSize: 11.5, textAlign: "right", marginTop: 2 },
  lineInputsRow: { flexDirection: "row-reverse", gap: 10, marginTop: 10 },
  lineInputGroup: { flex: 1 },
  lineInputLabel: { color: COLORS.muted, fontSize: 11, fontWeight: "600", textAlign: "right", marginBottom: 4 },
  lineInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: COLORS.text,
    fontSize: 13.5,
    fontWeight: "600",
  },
  notesInput: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
  },
  totalRow: {
    flexDirection: "row-reverse",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  totalLabel: { color: COLORS.muted, fontSize: 13, fontWeight: "600" },
  totalValue: { color: COLORS.text, fontSize: 19, fontWeight: "800" },
  footer: {
    flexDirection: "column",
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  footerButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  footerButtonPrimary: { backgroundColor: COLORS.primary },
  footerButtonPrimaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  footerButtonSecondary: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  footerButtonSecondaryText: { color: COLORS.text, fontSize: 14.5, fontWeight: "700" },
  footerButtonDisabled: { opacity: 0.6 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(17,24,39,0.4)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 30,
    maxHeight: "75%",
  },
  modalTitle: { color: COLORS.text, fontSize: 16, fontWeight: "800", textAlign: "right", marginBottom: 12 },
  modalList: { maxHeight: 420 },
  modalRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalRowDisabled: { opacity: 0.4 },
  modalRowText: { color: COLORS.text, fontSize: 14.5, fontWeight: "600", textAlign: "right" },
  modalRowSubtext: { color: COLORS.muted, fontSize: 11.5, textAlign: "right", marginTop: 2 },
  modalEmptyText: { color: COLORS.muted, fontSize: 13, textAlign: "center", paddingVertical: 20 },
  searchRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 14 },
});
