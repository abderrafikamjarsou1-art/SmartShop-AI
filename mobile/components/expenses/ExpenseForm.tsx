import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Check, ChevronDown } from "lucide-react-native";

import type { ExpenseCategory, ExpensePaymentMethod, RecurrenceInterval } from "@/services/expenses-service";

export type ExpenseFormValues = {
  title: string;
  category: ExpenseCategory;
  amount: string;
  taxAmount: string;
  date: string;
  supplierId: string;
  paymentMethod: ExpensePaymentMethod | "";
  notes: string;
  isRecurring: boolean;
  recurrenceInterval: RecurrenceInterval;
};

export const EMPTY_EXPENSE_FORM: ExpenseFormValues = {
  title: "",
  category: "OTHER",
  amount: "",
  taxAmount: "",
  date: new Date().toISOString().slice(0, 10),
  supplierId: "",
  paymentMethod: "",
  notes: "",
  isRecurring: false,
  recurrenceInterval: "MONTHLY",
};

const COLORS = {
  surface: "#FFFFFF",
  background: "#F7F8FC",
  text: "#111827",
  muted: "#6B7280",
  border: "#E9ECF2",
  primary: "#5B5CE2",
  danger: "#DC2626",
};

const CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: "RENT", label: "إيجار" },
  { value: "UTILITIES", label: "فواتير" },
  { value: "SALARIES", label: "رواتب" },
  { value: "MARKETING", label: "تسويق" },
  { value: "SUPPLIES", label: "مستلزمات" },
  { value: "TRANSPORT", label: "نقل" },
  { value: "MAINTENANCE", label: "صيانة" },
  { value: "TAXES", label: "ضرائب" },
  { value: "INSURANCE", label: "تأمين" },
  { value: "OTHER", label: "أخرى" },
];

const PAYMENT_METHODS: { value: ExpensePaymentMethod; label: string }[] = [
  { value: "CASH", label: "نقدًا" },
  { value: "CARD", label: "بطاقة" },
  { value: "BANK_TRANSFER", label: "تحويل بنكي" },
];

const RECURRENCE_INTERVALS: { value: RecurrenceInterval; label: string }[] = [
  { value: "WEEKLY", label: "أسبوعي" },
  { value: "MONTHLY", label: "شهري" },
  { value: "QUARTERLY", label: "ربعي" },
  { value: "YEARLY", label: "سنوي" },
];

type Props = {
  values: ExpenseFormValues;
  onChange: (values: ExpenseFormValues) => void;
  suppliers: { id: string; name: string }[];
  fieldErrors?: Record<string, string[]>;
  submitting: boolean;
  submitLabel: string;
  onSubmit: () => void;
};

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages || messages.length === 0) return null;
  return <Text style={styles.fieldError}>{messages[0]}</Text>;
}

export default function ExpenseForm({ values, onChange, suppliers, fieldErrors, submitting, submitLabel, onSubmit }: Props) {
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);

  const set = <K extends keyof ExpenseFormValues>(key: K, value: ExpenseFormValues[K]) =>
    onChange({ ...values, [key]: value });

  const selectedSupplier = suppliers.find((s) => s.id === values.supplierId) ?? null;
  const canSubmit =
    values.title.trim().length > 0 &&
    Number(values.amount) > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(values.date) &&
    (!values.isRecurring || !!values.recurrenceInterval) &&
    !submitting;

  return (
    <View>
      <View style={styles.field}>
        <Text style={styles.label}>العنوان *</Text>
        <TextInput
          value={values.title}
          onChangeText={(v) => set("title", v)}
          style={styles.input}
          placeholder="مثال: فاتورة الكهرباء"
          placeholderTextColor={COLORS.muted}
        />
        <FieldError messages={fieldErrors?.title} />
      </View>

      <Text style={styles.label}>الفئة</Text>
      <View style={styles.chipWrap}>
        {CATEGORIES.map((cat) => {
          const selected = values.category === cat.value;
          return (
            <Pressable
              key={cat.value}
              onPress={() => set("category", cat.value)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{cat.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <FieldError messages={fieldErrors?.category} />

      <View style={styles.row}>
        <View style={[styles.field, styles.halfField]}>
          <Text style={styles.label}>المبلغ *</Text>
          <TextInput
            value={values.amount}
            onChangeText={(v) => set("amount", v.replace(/[^0-9.]/g, ""))}
            style={styles.input}
            placeholder="0.00"
            placeholderTextColor={COLORS.muted}
            keyboardType="decimal-pad"
          />
          <FieldError messages={fieldErrors?.amount} />
        </View>

        <View style={[styles.field, styles.halfField]}>
          <Text style={styles.label}>الضريبة</Text>
          <TextInput
            value={values.taxAmount}
            onChangeText={(v) => set("taxAmount", v.replace(/[^0-9.]/g, ""))}
            style={styles.input}
            placeholder="0.00"
            placeholderTextColor={COLORS.muted}
            keyboardType="decimal-pad"
          />
          <FieldError messages={fieldErrors?.taxAmount} />
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>التاريخ *</Text>
        <TextInput
          value={values.date}
          onChangeText={(v) => set("date", v)}
          style={styles.input}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={COLORS.muted}
          autoCapitalize="none"
        />
        <FieldError messages={fieldErrors?.date} />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>المورد (اختياري)</Text>
        <Pressable style={styles.selectField} onPress={() => setSupplierPickerOpen(true)}>
          <ChevronDown size={18} color={COLORS.muted} strokeWidth={2.2} />
          <Text style={[styles.selectFieldText, !selectedSupplier && styles.placeholderText]}>
            {selectedSupplier?.name ?? "بدون مورد"}
          </Text>
        </Pressable>
        <FieldError messages={fieldErrors?.supplierId} />
      </View>

      <Text style={styles.label}>طريقة الدفع</Text>
      <View style={styles.chipWrap}>
        {PAYMENT_METHODS.map((method) => {
          const selected = values.paymentMethod === method.value;
          return (
            <Pressable
              key={method.value}
              onPress={() => set("paymentMethod", selected ? "" : method.value)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{method.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>ملاحظات</Text>
        <TextInput
          value={values.notes}
          onChangeText={(v) => set("notes", v)}
          style={[styles.input, styles.notesInput]}
          placeholder="اختياري"
          placeholderTextColor={COLORS.muted}
          multiline
        />
        <FieldError messages={fieldErrors?.notes} />
      </View>

      <View style={styles.switchRow}>
        <Switch value={values.isRecurring} onValueChange={(v) => set("isRecurring", v)} trackColor={{ true: COLORS.primary }} />
        <Text style={styles.switchLabel}>مصروف متكرر</Text>
      </View>

      {values.isRecurring ? (
        <View style={styles.field}>
          <Text style={styles.label}>التكرار</Text>
          <View style={styles.chipWrap}>
            {RECURRENCE_INTERVALS.map((interval) => {
              const selected = values.recurrenceInterval === interval.value;
              return (
                <Pressable
                  key={interval.value}
                  onPress={() => set("recurrenceInterval", interval.value)}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{interval.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <FieldError messages={fieldErrors?.recurrenceInterval} />
        </View>
      ) : null}

      <Pressable
        onPress={onSubmit}
        disabled={!canSubmit}
        style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
      >
        {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>{submitLabel}</Text>}
      </Pressable>

      <Modal visible={supplierPickerOpen} animationType="slide" transparent onRequestClose={() => setSupplierPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSupplierPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>اختر المورد</Text>
            <ScrollView style={styles.modalList}>
              <Pressable
                style={styles.modalRow}
                onPress={() => {
                  set("supplierId", "");
                  setSupplierPickerOpen(false);
                }}
              >
                <Text style={styles.modalRowText}>بدون مورد</Text>
                {values.supplierId === "" ? <Check size={18} color={COLORS.primary} strokeWidth={2.4} /> : null}
              </Pressable>
              {suppliers.map((supplier) => (
                <Pressable
                  key={supplier.id}
                  style={styles.modalRow}
                  onPress={() => {
                    set("supplierId", supplier.id);
                    setSupplierPickerOpen(false);
                  }}
                >
                  <Text style={styles.modalRowText}>{supplier.name}</Text>
                  {values.supplierId === supplier.id ? <Check size={18} color={COLORS.primary} strokeWidth={2.4} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.text,
    textAlign: "right",
  },
  notesInput: {
    minHeight: 70,
    textAlignVertical: "top",
  },
  fieldError: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 5,
    marginBottom: 8,
    textAlign: "right",
  },
  chipWrap: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.muted,
  },
  chipTextSelected: {
    color: "#FFFFFF",
  },
  selectField: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  selectFieldText: {
    color: COLORS.text,
    fontSize: 14.5,
    fontWeight: "600",
  },
  placeholderText: {
    color: COLORS.muted,
    fontWeight: "500",
  },
  switchRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  switchLabel: {
    color: COLORS.text,
    fontSize: 13.5,
    fontWeight: "600",
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
  modalBackdrop: { flex: 1, backgroundColor: "rgba(17,24,39,0.4)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 30,
    maxHeight: "70%",
  },
  modalTitle: { color: COLORS.text, fontSize: 16, fontWeight: "800", textAlign: "right", marginBottom: 12 },
  modalList: { maxHeight: 400 },
  modalRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalRowText: { color: COLORS.text, fontSize: 14.5, fontWeight: "600", textAlign: "right" },
});
