import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { ArrowRight, FileText, Pencil, Repeat, RotateCcw, Trash2 } from "lucide-react-native";

import ExpenseForm, { type ExpenseFormValues } from "@/components/expenses/ExpenseForm";
import {
  deleteExpense,
  getExpense,
  getExpenseErrorMessage,
  getExpenseFieldErrors,
  getExpenseOptions,
  restoreExpense,
  updateExpense,
  type Expense,
  type ExpenseCategory,
  type ExpenseInput,
} from "@/services/expenses-service";

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
  success: "#16A34A",
};

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  RENT: "إيجار",
  UTILITIES: "فواتير",
  SALARIES: "رواتب",
  MARKETING: "تسويق",
  SUPPLIES: "مستلزمات",
  TRANSPORT: "نقل",
  MAINTENANCE: "صيانة",
  TAXES: "ضرائب",
  INSURANCE: "تأمين",
  OTHER: "أخرى",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "نقدًا",
  CARD: "بطاقة",
  BANK_TRANSFER: "تحويل بنكي",
};

const RECURRENCE_LABELS: Record<string, string> = {
  WEEKLY: "أسبوعيًا",
  MONTHLY: "شهريًا",
  QUARTERLY: "كل ثلاثة أشهر",
  YEARLY: "سنويًا",
};

function money(value: number | string) {
  return `${Number(value).toFixed(2)} د.م`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ar-MA", { year: "numeric", month: "short", day: "numeric" });
}

function expenseToFormValues(expense: Expense): ExpenseFormValues {
  return {
    title: expense.title,
    category: expense.category,
    amount: String(expense.amount),
    taxAmount: Number(expense.taxAmount) > 0 ? String(expense.taxAmount) : "",
    date: expense.date.slice(0, 10),
    supplierId: expense.supplier?.id ?? "",
    paymentMethod: expense.paymentMethod ?? "",
    notes: expense.notes ?? "",
    isRecurring: expense.isRecurring,
    recurrenceInterval: expense.recurrenceInterval ?? "MONTHLY",
  };
}

function toUpdateInput(values: ExpenseFormValues): ExpenseInput {
  return {
    title: values.title.trim(),
    category: values.category,
    amount: Number(values.amount) || 0,
    taxAmount: values.taxAmount ? Number(values.taxAmount) : undefined,
    date: values.date,
    supplierId: values.supplierId || undefined,
    paymentMethod: values.paymentMethod || undefined,
    notes: values.notes.trim() || undefined,
    isRecurring: values.isRecurring,
    recurrenceInterval: values.isRecurring ? values.recurrenceInterval : undefined,
  };
}

export default function ExpenseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [expense, setExpense] = useState<Expense | null>(null);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [values, setValues] = useState<ExpenseFormValues | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const [result, options] = await Promise.all([getExpense(id), getExpenseOptions()]);
      setExpense(result);
      setSuppliers(options.suppliers);
    } catch (error) {
      setLoadError(getExpenseErrorMessage(error, "تعذر تحميل بيانات المصروف."));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function startEditing() {
    if (!expense) return;
    setValues(expenseToFormValues(expense));
    setErrorMessage(null);
    setFieldErrors({});
    setIsEditing(true);
  }

  async function handleSaveEdit() {
    if (!values || !expense || submitting) return;
    try {
      setSubmitting(true);
      setErrorMessage(null);
      setFieldErrors({});
      const updated = await updateExpense(expense.id, toUpdateInput(values));
      setExpense(updated);
      setIsEditing(false);
    } catch (error) {
      setFieldErrors(getExpenseFieldErrors(error));
      setErrorMessage(getExpenseErrorMessage(error, "تعذر حفظ التعديلات."));
    } finally {
      setSubmitting(false);
    }
  }

  function handleDelete() {
    if (!expense) return;
    Alert.alert("حذف المصروف", `هل أنت متأكد من حذف "${expense.title}"؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteExpense(expense.id);
            router.back();
          } catch (error) {
            Alert.alert("تعذر الحذف", getExpenseErrorMessage(error, "حدث خطأ أثناء حذف المصروف."));
          }
        },
      },
    ]);
  }

  async function handleRestore() {
    if (!expense) return;
    try {
      const restored = await restoreExpense(expense.id);
      setExpense(restored);
    } catch (error) {
      Alert.alert("تعذر الاستعادة", getExpenseErrorMessage(error, "حدث خطأ أثناء استعادة المصروف."));
    }
  }

  const isDeleted = !!expense?.deletedAt;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} hitSlop={8}>
          <ArrowRight size={22} color={COLORS.text} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {expense?.title ?? "المصروف"}
        </Text>
        <View style={styles.headerActions}>
          {isDeleted ? (
            <Pressable accessibilityRole="button" accessibilityLabel="استعادة" onPress={handleRestore} style={styles.iconButton}>
              <RotateCcw size={18} color={COLORS.success} strokeWidth={2.2} />
            </Pressable>
          ) : (
            <>
              <Pressable accessibilityRole="button" accessibilityLabel="حذف" onPress={handleDelete} disabled={!expense} style={styles.iconButton}>
                <Trash2 size={18} color={COLORS.danger} strokeWidth={2.2} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="تعديل" onPress={startEditing} disabled={!expense} style={styles.iconButton}>
                <Pencil size={18} color={COLORS.primary} strokeWidth={2.2} />
              </Pressable>
            </>
          )}
        </View>
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
      ) : expense ? (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {isEditing && values ? (
              <View style={styles.card}>
                {errorMessage ? <Text style={styles.errorBanner}>{errorMessage}</Text> : null}
                <ExpenseForm
                  values={values}
                  onChange={setValues}
                  suppliers={suppliers}
                  fieldErrors={fieldErrors}
                  submitting={submitting}
                  submitLabel="حفظ التعديلات"
                  onSubmit={handleSaveEdit}
                />
                <Pressable style={styles.cancelButton} onPress={() => setIsEditing(false)} disabled={submitting}>
                  <Text style={styles.cancelButtonText}>إلغاء</Text>
                </Pressable>
              </View>
            ) : (
              <>
                {isDeleted ? (
                  <View style={styles.trashBanner}>
                    <Text style={styles.trashBannerText}>هذا المصروف في المحذوفات</Text>
                  </View>
                ) : null}

                <View style={styles.amountCard}>
                  <Text style={styles.amountValue}>{money(expense.amount)}</Text>
                  {Number(expense.taxAmount) > 0 ? (
                    <Text style={styles.amountTax}>+ {money(expense.taxAmount)} ضريبة</Text>
                  ) : null}
                </View>

                <View style={styles.card}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoValue}>{CATEGORY_LABELS[expense.category]}</Text>
                    <Text style={styles.infoLabel}>الفئة</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoValue}>{formatDate(expense.date)}</Text>
                    <Text style={styles.infoLabel}>التاريخ</Text>
                  </View>
                  {expense.supplier ? (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoValue}>{expense.supplier.name}</Text>
                      <Text style={styles.infoLabel}>المورد</Text>
                    </View>
                  ) : null}
                  {expense.paymentMethod ? (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoValue}>{PAYMENT_METHOD_LABELS[expense.paymentMethod]}</Text>
                      <Text style={styles.infoLabel}>طريقة الدفع</Text>
                    </View>
                  ) : null}
                  {expense.notes ? (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoValue}>{expense.notes}</Text>
                      <Text style={styles.infoLabel}>ملاحظات</Text>
                    </View>
                  ) : null}
                </View>

                {expense.isRecurring ? (
                  <View style={styles.recurringCard}>
                    <Repeat size={16} color={COLORS.primary} strokeWidth={2.2} />
                    <Text style={styles.recurringText}>
                      يتكرر {RECURRENCE_LABELS[expense.recurrenceInterval ?? "MONTHLY"]}
                    </Text>
                  </View>
                ) : null}

                {expense.attachments.length > 0 ? (
                  <>
                    <Text style={styles.sectionTitle}>المرفقات</Text>
                    <View style={styles.card}>
                      {expense.attachments.map((attachment, index) => (
                        <Pressable
                          key={attachment.path || index}
                          style={[styles.attachmentRow, index > 0 && styles.attachmentRowBorder]}
                          onPress={() => Linking.openURL(attachment.url)}
                        >
                          <FileText size={16} color={COLORS.muted} strokeWidth={2} />
                          <Text style={styles.attachmentName} numberOfLines={1}>
                            {attachment.name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : null}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
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
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primarySoft,
  },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  errorText: { color: COLORS.danger, fontSize: 14, fontWeight: "600", textAlign: "center", marginBottom: 16, lineHeight: 21 },
  retryButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  retryText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  content: { padding: 18, paddingBottom: 48 },
  errorBanner: { color: COLORS.danger, fontSize: 13, fontWeight: "600", textAlign: "center", marginBottom: 16 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
  },
  cancelButton: { marginTop: 10, alignItems: "center", paddingVertical: 10 },
  cancelButtonText: { color: COLORS.muted, fontSize: 13, fontWeight: "700" },
  trashBanner: {
    backgroundColor: COLORS.dangerSoft,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 14,
  },
  trashBannerText: { color: COLORS.danger, fontSize: 12.5, fontWeight: "700" },
  amountCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 22,
    alignItems: "center",
    marginBottom: 14,
  },
  amountValue: { color: COLORS.text, fontSize: 28, fontWeight: "800" },
  amountTax: { color: COLORS.muted, fontSize: 12.5, fontWeight: "600", marginTop: 4 },
  infoRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  infoLabel: { color: COLORS.muted, fontSize: 12.5, fontWeight: "600" },
  infoValue: { color: COLORS.text, fontSize: 13.5, fontWeight: "700", flexShrink: 1, textAlign: "left" },
  recurringCard: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primarySoft,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  recurringText: { color: COLORS.primary, fontSize: 12.5, fontWeight: "700" },
  sectionTitle: { color: COLORS.text, fontSize: 15, fontWeight: "800", textAlign: "right", marginBottom: 10 },
  attachmentRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 12 },
  attachmentRowBorder: { borderTopWidth: 1, borderTopColor: COLORS.border },
  attachmentName: { color: COLORS.text, fontSize: 13.5, fontWeight: "600", flex: 1, textAlign: "right" },
});
