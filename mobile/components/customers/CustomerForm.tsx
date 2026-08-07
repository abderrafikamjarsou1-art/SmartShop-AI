import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export type CustomerFormValues = {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  tags: string;
};

export const EMPTY_CUSTOMER_FORM: CustomerFormValues = {
  name: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  tags: "",
};

const COLORS = {
  text: "#111827",
  muted: "#6B7280",
  border: "#E9ECF2",
  primary: "#5B5CE2",
  danger: "#DC2626",
  fieldBg: "#F8FAFC",
};

type Props = {
  values: CustomerFormValues;
  onChange: (values: CustomerFormValues) => void;
  fieldErrors?: Record<string, string[]>;
  submitting: boolean;
  submitLabel: string;
  onSubmit: () => void;
};

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages || messages.length === 0) return null;
  return <Text style={styles.fieldError}>{messages[0]}</Text>;
}

export default function CustomerForm({ values, onChange, fieldErrors, submitting, submitLabel, onSubmit }: Props) {
  const set = <K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) =>
    onChange({ ...values, [key]: value });

  const canSubmit = values.name.trim().length > 0 && !submitting;

  return (
    <View>
      <View style={styles.field}>
        <Text style={styles.label}>الاسم *</Text>
        <TextInput
          value={values.name}
          onChangeText={(v) => set("name", v)}
          style={styles.input}
          placeholder="اسم العميل"
          placeholderTextColor={COLORS.muted}
        />
        <FieldError messages={fieldErrors?.name} />
      </View>

      <View style={styles.row}>
        <View style={[styles.field, styles.halfField]}>
          <Text style={styles.label}>الهاتف</Text>
          <TextInput
            value={values.phone}
            onChangeText={(v) => set("phone", v)}
            style={styles.input}
            placeholder="اختياري"
            placeholderTextColor={COLORS.muted}
            keyboardType="phone-pad"
          />
          <FieldError messages={fieldErrors?.phone} />
        </View>

        <View style={[styles.field, styles.halfField]}>
          <Text style={styles.label}>البريد الإلكتروني</Text>
          <TextInput
            value={values.email}
            onChangeText={(v) => set("email", v)}
            style={styles.input}
            placeholder="اختياري"
            placeholderTextColor={COLORS.muted}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <FieldError messages={fieldErrors?.email} />
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>العنوان</Text>
        <TextInput
          value={values.address}
          onChangeText={(v) => set("address", v)}
          style={styles.input}
          placeholder="اختياري"
          placeholderTextColor={COLORS.muted}
        />
        <FieldError messages={fieldErrors?.address} />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>الوسوم (مفصولة بفاصلة)</Text>
        <TextInput
          value={values.tags}
          onChangeText={(v) => set("tags", v)}
          style={styles.input}
          placeholder="مثال: جملة، مميز"
          placeholderTextColor={COLORS.muted}
        />
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
  notesInput: {
    minHeight: 70,
    textAlignVertical: "top",
  },
  fieldError: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 5,
    textAlign: "right",
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
