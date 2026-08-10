import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { ArrowRight } from "lucide-react-native";

import ExpenseForm, { EMPTY_EXPENSE_FORM, type ExpenseFormValues } from "@/components/expenses/ExpenseForm";
import {
  createExpense,
  getExpenseErrorMessage,
  getExpenseFieldErrors,
  getExpenseOptions,
  type ExpenseInput,
} from "@/services/expenses-service";

const COLORS = {
  background: "#F7F8FC",
  text: "#111827",
  danger: "#DC2626",
  primary: "#5B5CE2",
};

function toCreateInput(values: ExpenseFormValues): ExpenseInput {
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

export default function NewExpenseScreen() {
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [values, setValues] = useState<ExpenseFormValues>(EMPTY_EXPENSE_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getExpenseOptions();
        if (!cancelled) setSuppliers(result.suppliers);
      } catch (error) {
        if (!cancelled) setOptionsError(getExpenseErrorMessage(error, "تعذر تحميل بيانات النموذج."));
      } finally {
        if (!cancelled) setIsLoadingOptions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit() {
    if (submitting) return;
    try {
      setSubmitting(true);
      setErrorMessage(null);
      setFieldErrors({});
      const expense = await createExpense(toCreateInput(values));
      router.replace(`/expenses/${expense.id}`);
    } catch (error) {
      setFieldErrors(getExpenseFieldErrors(error));
      setErrorMessage(getExpenseErrorMessage(error, "تعذر حفظ المصروف."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="إلغاء" onPress={() => router.back()} hitSlop={8}>
            <ArrowRight size={22} color={COLORS.text} strokeWidth={2.2} />
          </Pressable>
          <Text style={styles.title}>مصروف جديد</Text>
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
            {errorMessage ? <Text style={styles.errorBanner}>{errorMessage}</Text> : null}
            <ExpenseForm
              values={values}
              onChange={setValues}
              suppliers={suppliers}
              fieldErrors={fieldErrors}
              submitting={submitting}
              submitLabel="حفظ المصروف"
              onSubmit={handleSubmit}
            />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
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
    paddingVertical: 12,
  },
  title: { color: COLORS.text, fontSize: 17, fontWeight: "800" },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  errorText: { color: COLORS.danger, fontSize: 14, fontWeight: "600", textAlign: "center" },
  errorBanner: { color: COLORS.danger, fontSize: 13, fontWeight: "600", textAlign: "center", marginBottom: 16 },
  content: { paddingHorizontal: 18, paddingBottom: 40 },
});
