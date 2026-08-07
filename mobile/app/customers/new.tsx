import { useState } from "react";
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

import CustomerForm, { EMPTY_CUSTOMER_FORM, type CustomerFormValues } from "@/components/customers/CustomerForm";
import {
  createCustomer,
  getCustomerErrorMessage,
  getCustomerFieldErrors,
  type CreateCustomerInput,
} from "@/services/customers-service";

const COLORS = {
  background: "#F7F8FC",
  surface: "#FFFFFF",
  text: "#111827",
  border: "#E9ECF2",
  danger: "#DC2626",
};

function toCreateInput(values: CustomerFormValues): CreateCustomerInput {
  return {
    name: values.name.trim(),
    phone: values.phone.trim() || undefined,
    email: values.email.trim() || undefined,
    address: values.address.trim() || undefined,
    notes: values.notes.trim() || undefined,
    tags: values.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

export default function NewCustomerScreen() {
  const [values, setValues] = useState<CustomerFormValues>(EMPTY_CUSTOMER_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  async function handleSubmit() {
    if (submitting) return;

    try {
      setSubmitting(true);
      setErrorMessage(null);
      setFieldErrors({});

      await createCustomer(toCreateInput(values));

      Alert.alert("تم بنجاح", "تم إضافة العميل بنجاح.", [{ text: "حسنًا", onPress: () => router.back() }]);
    } catch (error) {
      setFieldErrors(getCustomerFieldErrors(error));
      setErrorMessage(getCustomerErrorMessage(error, "تعذر إضافة العميل. تحقق من البيانات وحاول مجددًا."));
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
        <Text style={styles.headerTitle}>عميل جديد</Text>
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

          <CustomerForm
            values={values}
            onChange={setValues}
            fieldErrors={fieldErrors}
            submitting={submitting}
            submitLabel="إضافة العميل"
            onSubmit={handleSubmit}
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
