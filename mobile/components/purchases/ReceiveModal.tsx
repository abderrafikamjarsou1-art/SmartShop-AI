import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { X } from "lucide-react-native";

import type { PurchaseItem } from "@/services/purchases-service";

const COLORS = {
  surface: "#FFFFFF",
  background: "#F7F8FC",
  text: "#111827",
  muted: "#6B7280",
  border: "#E9ECF2",
  primary: "#5B5CE2",
  danger: "#DC2626",
};

type Props = {
  visible: boolean;
  items: PurchaseItem[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (lines: { purchaseItemId: string; quantity: number }[], updateProductCost: boolean) => void;
};

export default function ReceiveModal({ visible, items, isSubmitting, onClose, onSubmit }: Props) {
  const receivable = useMemo(
    () => items.filter((item) => item.receivedQuantity < item.quantity),
    [items]
  );

  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [updateProductCost, setUpdateProductCost] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const initial: Record<string, string> = {};
    for (const item of receivable) {
      initial[item.id] = String(item.quantity - item.receivedQuantity);
    }
    setQuantities(initial);
    setUpdateProductCost(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function handleSubmit() {
    const lines = receivable
      .map((item) => ({ purchaseItemId: item.id, quantity: Number(quantities[item.id]) || 0 }))
      .filter((line) => line.quantity > 0);
    if (lines.length === 0) return;
    onSubmit(lines, updateProductCost);
  }

  const hasAnyQuantity = receivable.some((item) => (Number(quantities[item.id]) || 0) > 0);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.headerRow}>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={20} color={COLORS.muted} strokeWidth={2.2} />
            </Pressable>
            <Text style={styles.title}>استلام بضاعة</Text>
          </View>

          <ScrollView style={styles.list}>
            {receivable.map((item) => {
              const remaining = item.quantity - item.receivedQuantity;
              return (
                <View key={item.id} style={styles.row}>
                  <TextInput
                    value={quantities[item.id] ?? ""}
                    onChangeText={(v) => {
                      const digits = v.replace(/[^0-9]/g, "");
                      const clamped = digits === "" ? "" : String(Math.min(Number(digits), remaining));
                      setQuantities((q) => ({ ...q, [item.id]: clamped }));
                    }}
                    keyboardType="number-pad"
                    style={styles.qtyInput}
                    textAlign="center"
                  />
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {item.product.name}
                    </Text>
                    <Text style={styles.rowMeta}>المتبقي: {remaining}</Text>
                  </View>
                </View>
              );
            })}
            {receivable.length === 0 ? <Text style={styles.emptyText}>لا توجد أصناف بانتظار الاستلام</Text> : null}
          </ScrollView>

          <View style={styles.switchRow}>
            <Switch value={updateProductCost} onValueChange={setUpdateProductCost} trackColor={{ true: COLORS.primary }} />
            <Text style={styles.switchLabel}>تحديث سعر تكلفة المنتج</Text>
          </View>

          <Pressable
            style={[styles.submitButton, (!hasAnyQuantity || isSubmitting) && styles.submitButtonDisabled]}
            disabled={!hasAnyQuantity || isSubmitting}
            onPress={handleSubmit}
          >
            {isSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitButtonText}>تأكيد الاستلام</Text>}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(17,24,39,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 30,
    maxHeight: "80%",
  },
  headerRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  title: { color: COLORS.text, fontSize: 16, fontWeight: "800" },
  list: { maxHeight: 360 },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowInfo: { flex: 1, alignItems: "flex-end" },
  rowName: { color: COLORS.text, fontSize: 14, fontWeight: "700", textAlign: "right" },
  rowMeta: { color: COLORS.muted, fontSize: 11.5, marginTop: 3 },
  qtyInput: {
    width: 64,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 8,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
  emptyText: { color: COLORS.muted, fontSize: 13, textAlign: "center", paddingVertical: 20 },
  switchRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    marginBottom: 16,
  },
  switchLabel: { color: COLORS.text, fontSize: 13.5, fontWeight: "600" },
  submitButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
});
