import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { FileSpreadsheet, FileText } from "lucide-react-native";
import {
  exportAndShareReport,
  getReportErrorMessage,
  type ExportFormat,
  type ExportReportType,
  type ReportPeriodParams,
} from "@/services/reports-service";

type Props = {
  report: ExportReportType;
  period: ReportPeriodParams;
};

const COLORS = {
  text: "#111827",
  primary: "#5B5CE2",
  primarySoft: "#EEF0FF",
};

export default function ExportButtons({ report, period }: Props) {
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);

  async function handleExport(format: ExportFormat) {
    if (exportingFormat) return;
    try {
      setExportingFormat(format);
      await exportAndShareReport(report, format, period);
    } catch (error) {
      Alert.alert("تعذر التصدير", getReportErrorMessage(error, "حدث خطأ أثناء تصدير التقرير."));
    } finally {
      setExportingFormat(null);
    }
  }

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="تصدير PDF"
        onPress={() => handleExport("pdf")}
        disabled={exportingFormat !== null}
        style={styles.button}
      >
        {exportingFormat === "pdf" ? (
          <ActivityIndicator size="small" color={COLORS.primary} />
        ) : (
          <FileText size={15} color={COLORS.primary} strokeWidth={2.2} />
        )}
        <Text style={styles.buttonText}>PDF</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="تصدير Excel"
        onPress={() => handleExport("xlsx")}
        disabled={exportingFormat !== null}
        style={styles.button}
      >
        {exportingFormat === "xlsx" ? (
          <ActivityIndicator size="small" color={COLORS.primary} />
        ) : (
          <FileSpreadsheet size={15} color={COLORS.primary} strokeWidth={2.2} />
        )}
        <Text style={styles.buttonText}>Excel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row-reverse",
    gap: 8,
  },
  button: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  buttonText: {
    color: COLORS.primary,
    fontSize: 11.5,
    fontWeight: "800",
  },
});
