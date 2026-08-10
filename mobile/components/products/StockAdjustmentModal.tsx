import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ArrowLeft, X } from "lucide-react-native";
import { adjustStock, getProductErrorMessage, type Product } from "@/services/products-service";

type Props = {
  visible: boolean;
  product: Product;
  onClose: () => void;
  onAdjusted: (updated: Product) => void;
};

const COLORS = {
  overlay: "rgba(17, 24, 39, 0.45)",
  surface: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  border: "#E9ECF2",
  primary: "#5B5CE2",
  danger: "#DC2626",
  successSoft: "#ECFDF3",
  success: "#16A34A",
};

export default function StockAdjustmentModal({ visible, product, onClose, onAdjusted }: Props) {
  const [newQuantityText, setNewQuantityText] = useState(String(product.quantity));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const parsedQuantity = Number(newQuantityText);
  const isValidQuantity = newQuantityText.trim().length > 0 && Number.isFinite(parsedQuantity) && parsedQuantity >= 0 && Number.isInteger(parsedQuantity);
  const isUnchanged = isValidQuantity && parsedQuantity === product.quantity;
  const canSubmit = isValidQuantity && !isUnchanged && reason.trim().length > 0 && !saving;

  const delta = isValidQuantity ? parsedQuantity - product.quantity : 0;

  async function handleSubmit() {
    if (!canSubmit) return;

    try {
      setSaving(true);
      setErrorMessage(null);
      const updated = await adjustStock(product.id, {
        newQuantity: parsedQuantity,
        reason: reason.trim(),
      });
      onAdjusted(updated);
      setReason("");
    } catch (error) {
      setErrorMessage(getProductErrorMessage(error, "تعذر تعديل الكمية. حاول مرة أخرى."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheetWrap}
        >
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Pressable accessibilityRole="button" accessibilityLabel="إغلاق" onPress={onClose} hitSlop={8}>
                <X size={22} color={COLORS.muted} strokeWidth={2.2} />
              </Pressable>
              <Text style={styles.title}>تعديل الكمية</Text>
            </View>

            <Text style={styles.productName} numberOfLines={1}>
              {product.name}
            </Text>

            <View style={styles.field}>
              <Text style={styles.label}>الكمية الجديدة</Text>
              <TextInput
                value={newQuantityText}
                onChangeText={setNewQuantityText}
                keyboardType="number-pad"
                style={styles.input}
                placeholder="0"
                placeholderTextColor={COLORS.muted}
              />
            </View>

            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>الحالية</Text>
                <Text style={styles.summaryValue}>{product.quantity}</Text>
              </View>

              <ArrowLeft size={18} color={COLORS.muted} strokeWidth={2.2} />

              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>بعد التعديل</Text>
                <Text style={[styles.summaryValue, isValidQuantity ? styles.summaryValueHighlight : undefined]}>
                  {isValidQuantity ? parsedQuantity : "—"}
                </Text>
              </View>

              {isValidQuantity && !isUnchanged ? (
                <View style={[styles.deltaBadge, delta > 0 ? styles.deltaPositive : styles.deltaNegative]}>
                  <Text
                    style={[
                      styles.deltaText,
                      { color: delta > 0 ? COLORS.success : COLORS.danger },
                    ]}
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>سبب التعديل *</Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                style={[styles.input, styles.reasonInput]}
                placeholder="مثال: جرد المخزون، تلف، تصحيح خطأ"
                placeholderTextColor={COLORS.muted}
                multiline
              />
            </View>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitText}>حفظ التعديل</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: "flex-end",
  },
  sheetWrap: {
    width: "100%",
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 32,
  },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  title: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "800",
  },
  productName: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "right",
    marginBottom: 18,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
    textAlign: "right",
  },
  reasonInput: {
    minHeight: 70,
    textAlignVertical: "top",
  },
  summaryRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  summaryItem: {
    alignItems: "center",
  },
  summaryLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 4,
  },
  summaryValue: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "800",
  },
  summaryValueHighlight: {
    color: COLORS.primary,
  },
  deltaBadge: {
    position: "absolute",
    top: -10,
    left: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  deltaPositive: {
    backgroundColor: COLORS.successSoft,
  },
  deltaNegative: {
    backgroundColor: "#FEF2F2",
  },
  deltaText: {
    fontSize: 11,
    fontWeight: "800",
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 14,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
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
