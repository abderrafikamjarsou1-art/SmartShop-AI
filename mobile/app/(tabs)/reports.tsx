import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { RotateCcw } from "lucide-react-native";

import StatCard from "@/components/dashboard/StatCard";
import TopProducts from "@/components/dashboard/TopProducts";
import PeriodSelector from "@/components/reports/PeriodSelector";
import ExportButtons from "@/components/reports/ExportButtons";
import LowStockSection from "@/components/reports/LowStockSection";
import ValuationSection from "@/components/reports/ValuationSection";
import { getProducts, getProductErrorMessage, type Product } from "@/services/products-service";
import { getInventoryDashboard, type InventoryDashboard } from "@/services/inventory-service";
import {
  getReportSummary,
  getReportErrorMessage,
  type ReportPeriodParams,
  type ReportPreset,
  type ReportSummary,
} from "@/services/reports-service";

const COLORS = {
  background: "#F7F8FC",
  surface: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  border: "#E9ECF2",
  primary: "#5B5CE2",
  danger: "#DC2626",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function money(value: number) {
  return `${value.toFixed(2)} د.م`;
}

export default function ReportsScreen() {
  const [preset, setPreset] = useState<ReportPreset>("monthly");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [report, setReport] = useState<ReportSummary | null>(null);
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [valuation, setValuation] = useState<InventoryDashboard | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const period = useMemo<ReportPeriodParams | null>(() => {
    if (preset !== "custom") return { preset };
    if (!DATE_RE.test(customFrom) || !DATE_RE.test(customTo)) return null;
    return { preset, from: customFrom, to: customTo };
  }, [preset, customFrom, customTo]);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (!period) return;
      if (mode === "initial") setIsLoading(true);
      else setIsRefreshing(true);
      setErrorMessage(null);

      try {
        const [summary, lowStockResult, valuationResult] = await Promise.all([
          getReportSummary(period),
          getProducts({ stock: "low", perPage: 50, sortBy: "quantity", sortDir: "asc" }),
          getInventoryDashboard(),
        ]);
        setReport(summary);
        setLowStock(lowStockResult.items);
        setValuation(valuationResult);
      } catch (error) {
        setErrorMessage(
          getReportErrorMessage(error, getProductErrorMessage(error, "تعذر تحميل التقارير."))
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [period]
  );

  useEffect(() => {
    load("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period?.preset, period?.from, period?.to]);

  const handleRefresh = useCallback(() => load("refresh"), [load]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Text style={styles.title}>التقارير</Text>
      </View>

      <PeriodSelector
        preset={preset}
        customFrom={customFrom}
        customTo={customTo}
        onPresetChange={setPreset}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
      />

      {preset === "custom" && !period ? (
        <View style={styles.centerState}>
          <Text style={styles.hintText}>أدخل تاريخ البداية والنهاية (YYYY-MM-DD) لعرض التقرير المخصص.</Text>
        </View>
      ) : isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : errorMessage && !report ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Pressable style={styles.retryButton} onPress={() => load("initial")}>
            <RotateCcw size={16} color="#FFFFFF" strokeWidth={2.4} />
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </Pressable>
        </View>
      ) : report && valuation ? (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
        >
          <Text style={styles.periodLabel}>{report.period.label}</Text>

          <SectionHeader title="ملخص المبيعات والأرباح" action={<ExportButtons report="financial-summary" period={period!} />} />
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <StatCard title="صافي المبيعات" value={money(report.summary.netRevenue)} trend={report.deltas.netRevenue ?? undefined} />
            </View>
            <View style={styles.statItem}>
              <StatCard title="إجمالي الربح" value={money(report.summary.grossProfit)} helperText={`هامش ${report.summary.grossMargin}%`} />
            </View>
            <View style={styles.statItem}>
              <StatCard title="صافي الربح" value={money(report.summary.netProfit)} trend={report.deltas.netProfit ?? undefined} />
            </View>
            <View style={styles.statItem}>
              <StatCard title="المصاريف" value={money(report.summary.operatingExpenses)} trend={report.deltas.expenses ?? undefined} />
            </View>
          </View>

          <SectionHeader title="الأكثر مبيعًا" action={<ExportButtons report="top-products" period={period!} />} />
          <View style={styles.card}>
            <TopProducts products={report.topProducts} />
          </View>

          <SectionHeader title="المخزون المنخفض" action={<ExportButtons report="low-stock" period={period!} />} />
          <View style={styles.card}>
            <LowStockSection products={lowStock} />
          </View>

          <SectionHeader title="تقييم المخزون" action={<ExportButtons report="inventory-valuation" period={period!} />} />
          <View style={styles.card}>
            <ValuationSection valuation={valuation} />
          </View>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      {action}
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "800",
    textAlign: "right",
  },
  content: {
    paddingBottom: 60,
  },
  periodLabel: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
    paddingHorizontal: 18,
    marginTop: 16,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  hintText: {
    color: COLORS.muted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 21,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 21,
  },
  retryButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  retryText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  statsGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    paddingHorizontal: 12,
  },
  statItem: {
    width: "50%",
    paddingHorizontal: 6,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    marginTop: 22,
    marginBottom: 10,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "800",
    textAlign: "right",
  },
  card: {
    marginHorizontal: 18,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});
