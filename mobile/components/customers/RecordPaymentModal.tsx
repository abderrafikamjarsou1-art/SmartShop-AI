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
import { X } from "lucide-react-native";
import {
  recordCustomerPayment,
  getCustomerErrorMessage,
  type PaymentMethod,
  type RecordPaymentResult,
} from "@/services/customers-service";

type Props = {
  visible: boolean;
  customerId: string;
  outstandingBalance: number;
  onClose: () => void;
  onRecorded: (result: RecordPaymentResult) => void;
};

const COLORS = {
  overlay: "rgba(17, 24, 39, 0.45)",
  surface: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  border: "#E9ECF2",
  primary: "#5B5CE2",
  danger: "#DC2626",
};

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "نقدًا" },
  { value: "CARD", label: "بطاقة" },
  { value: "BANK_TRANSFER", label: "تحويل بنكي" },
  { value: "STORE_CREDIT", label: "رصيد العميل" },
];

export default function RecordPaymentModal({ visible, customerId, outstandingBalance, onClose, onRecorded }: Props) {
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [amountText, setAmountText] = useState(outstandingBalance.toFixed(2));
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const amount = Number(amountText);
  const isValidAmount = amountText.trim().length > 0 && Number.isFinite(amount) && amount > 0 && amount <= outstandingBalance;
  const canSubmit = isValidAmount && !saving;

  async function handleSubmit() {
    if (!canSubmit) return;
    try {
      setSaving(true);
      setErrorMessage(null);
      const result = await recordCustomerPayment(customerId, {
        method,
        amount,
        reference: reference.trim() || undefined,
      });
      onRecorded(result);
    } catch (error) {
      setErrorMessage(getCustomerErrorMessage(error, "تعذر تسجيل الدفعة. حاول مرة أخرى."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Pressable accessibilityRole="button" accessibilityLabel="إغلاق" onPress={onClose} hitSlop={8}>
                <X size={22} color={COLORS.muted} strokeWidth={2.2} />
              </Pressable>
              <Text style={styles.title}>تسجيل دفعة</Text>
            </View>

            <Text style={styles.balanceLabel}>الرصيد المستحق</Text>
            <Text style={styles.balanceValue}>{outstandingBalance.toFixed(2)} د.م</Text>

            <View style={styles.field}>
              <Text style={styles.label}>طريقة الدفع</Text>
              <View style={styles.methodRow}>
                {METHODS.map((m) => {
                  const selected = method === m.value;
                  return (
                    <Pressable
                      key={m.value}
                      onPress={() => setMethod(m.value)}
                      style={[styles.methodPill, selected && styles.methodPillSelected]}
                    >
                      <Text style={[styles.methodText, selected && styles.methodTextSelected]}>{m.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>المبلغ</Text>
              <TextInput
                value={amountText}
                onChangeText={setAmountText}
                keyboardType="decimal-pad"
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor={COLORS.muted}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>مرجع (اختياري)</Text>
              <TextInput
                value={reference}
                onChangeText={setReference}
                style={styles.input}
                placeholder="رقم إيصال أو ملاحظة"
                placeholderTextColor={COLORS.muted}
              />
            </View>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
            >
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>تسجيل الدفعة</Text>}
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
    marginBottom: 16,
  },
  title: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "800",
  },
  balanceLabel: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  balanceValue: {
    color: COLORS.danger,
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
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
  methodRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
  },
  methodPill: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
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
