import { StyleSheet, Text, TextInput, View, Pressable } from "react-native";
import type { ReportPreset } from "@/services/reports-service";

type Props = {
  preset: ReportPreset;
  customFrom: string;
  customTo: string;
  onPresetChange: (preset: ReportPreset) => void;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
};

const PRESETS: { value: ReportPreset; label: string }[] = [
  { value: "daily", label: "اليوم" },
  { value: "weekly", label: "أسبوعي" },
  { value: "monthly", label: "شهري" },
  { value: "quarterly", label: "ربعي" },
  { value: "yearly", label: "سنوي" },
  { value: "custom", label: "مخصص" },
];

const COLORS = {
  surface: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  border: "#E9ECF2",
  primary: "#5B5CE2",
};

export default function PeriodSelector({
  preset,
  customFrom,
  customTo,
  onPresetChange,
  onCustomFromChange,
  onCustomToChange,
}: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.chipRow}>
        {PRESETS.map((option) => {
          const selected = preset === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onPresetChange(option.value)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {preset === "custom" ? (
        <View style={styles.dateRow}>
          <View style={styles.dateField}>
            <Text style={styles.dateLabel}>من</Text>
            <TextInput
              value={customFrom}
              onChangeText={onCustomFromChange}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={COLORS.muted}
              style={styles.dateInput}
              autoCapitalize="none"
              keyboardType={/^[0-9-]*$/.test(customFrom) ? "numbers-and-punctuation" : "default"}
            />
          </View>
          <View style={styles.dateField}>
            <Text style={styles.dateLabel}>إلى</Text>
            <TextInput
              value={customTo}
              onChangeText={onCustomToChange}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={COLORS.muted}
              style={styles.dateInput}
              autoCapitalize="none"
              keyboardType={/^[0-9-]*$/.test(customTo) ? "numbers-and-punctuation" : "default"}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 18,
    marginTop: 14,
  },
  chipRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
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
  dateRow: {
    flexDirection: "row-reverse",
    gap: 10,
    marginTop: 12,
  },
  dateField: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "right",
    marginBottom: 6,
  },
  dateInput: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: COLORS.text,
    textAlign: "right",
  },
});
