import { useCallback, useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
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
import { router } from "expo-router";
import {
  AlertTriangle,
  Banknote,
  PackageSearch,
  ReceiptText,
  RotateCcw,
  TrendingUp,
} from "lucide-react-native";

import Header from "../../components/dashboard/Header";
import StatCard from "../../components/dashboard/StatCard";
import QuickActions from "../../components/dashboard/QuickActions";
import SalesChart from "../../components/dashboard/SalesChart";
import RecentOrders from "../../components/dashboard/RecentOrders";
import TopProducts from "../../components/dashboard/TopProducts";
import { getDashboard, getDashboardErrorMessage, type DashboardData } from "@/services/dashboard-service";

const COLORS = {
  background: "#F7F8FC",
  surface: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  border: "#E9ECF2",
  primary: "#5B5CE2",
  danger: "#DC2626",
};

function money(value: number) {
  return `${value.toFixed(2)} د.م`;
}

export default function DashboardScreen() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setIsLoading(true);
    else setIsRefreshing(true);
    setErrorMessage(null);

    try {
      const result = await getDashboard();
      setData(result);
    } catch (error) {
      setErrorMessage(getDashboardErrorMessage(error, "تعذر تحميل بيانات لوحة التحكم."));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load("initial");
  }, [load]);

  const handleRefresh = useCallback(() => load("refresh"), [load]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar style="dark" />

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : errorMessage && !data ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Pressable style={styles.retryButton} onPress={() => load("initial")}>
            <RotateCcw size={16} color="#FFFFFF" strokeWidth={2.4} />
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </Pressable>
        </View>
      ) : data ? (
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
          }
        >
          <Header />

          <View style={styles.hero}>
            <View style={styles.heroTopRow}>
              <View style={styles.heroText}>
                <Text style={styles.heroLabel}>نظرة عامة</Text>
                <Text style={styles.heroTitle}>أداء متجرك اليوم</Text>
                <Text style={styles.heroDescription}>
                  تابع المبيعات والأرباح وحالة المخزون من مكان واحد.
                </Text>
              </View>

              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>مباشر</Text>
              </View>
            </View>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <StatCard
                title="مبيعات اليوم"
                value={money(data.stats.todaySales)}
                icon={Banknote}
                trend={data.stats.todayDelta ?? undefined}
                helperText={data.stats.todayDelta === null ? "لا مقارنة متاحة" : "مقارنة بالأمس"}
              />
            </View>

            <View style={styles.statItem}>
              <StatCard
                title="صافي الأرباح"
                value={money(data.stats.profit)}
                icon={TrendingUp}
                trend={data.stats.profitDelta ?? undefined}
                helperText="هذا الشهر"
              />
            </View>

            <View style={styles.statItem}>
              <StatCard
                title="عدد الطلبات"
                value={String(data.todayOrderCount)}
                icon={ReceiptText}
                helperText="اليوم"
              />
            </View>

            <Pressable
              style={styles.statItem}
              onPress={() => router.push({ pathname: "/products", params: { stock: "low" } })}
            >
              <StatCard
                title="مخزون منخفض"
                value={String(data.lowStock.length)}
                icon={data.lowStock.length > 0 ? AlertTriangle : PackageSearch}
                helperText={data.lowStock.length > 0 ? "اضغط للمراجعة" : "كل شيء بخير"}
              />
            </Pressable>
          </View>

          <SectionHeader title="إجراءات سريعة" subtitle="اختصارات لأكثر المهام استخدامًا" />
          <QuickActions />

          <SectionHeader title="تحليل المبيعات" subtitle="تطور الأداء خلال الأيام الأخيرة" />
          <SalesChart data={data.weeklySeries} />

          <SectionHeader title="الأكثر مبيعًا" subtitle="أفضل المنتجات أداءً هذا الشهر" />
          <TopProducts products={data.topProducts} />

          <SectionHeader title="آخر المبيعات" subtitle="أحدث العمليات المسجلة في متجرك" />
          <RecentOrders sales={data.recentSales} />
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
};

function SectionHeader({ title, subtitle }: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  content: {
    paddingBottom: 120,
  },

  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
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

  hero: {
    marginHorizontal: 18,
    marginTop: 8,
    marginBottom: 18,
    padding: 20,
    borderRadius: 24,
    backgroundColor: "#17182F",
    shadowColor: "#17182F",
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 8,
  },

  heroTopRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
  },

  heroText: {
    flex: 1,
    alignItems: "flex-end",
  },

  heroLabel: {
    color: "#A5B4FC",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },

  heroTitle: {
    color: "#FFFFFF",
    fontSize: 25,
    lineHeight: 34,
    fontWeight: "800",
    textAlign: "right",
  },

  heroDescription: {
    color: "#C7CAD8",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "right",
    marginTop: 8,
  },

  liveBadge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#34D399",
  },

  liveText: {
    color: "#E5E7EB",
    fontSize: 11,
    fontWeight: "700",
  },

  statsGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    marginBottom: 10,
  },

  statItem: {
    width: "50%",
    paddingHorizontal: 6,
    marginBottom: 12,
  },

  sectionHeader: {
    paddingHorizontal: 18,
    marginTop: 22,
    marginBottom: 12,
    alignItems: "flex-end",
  },

  sectionTitle: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: "800",
    textAlign: "right",
  },

  sectionSubtitle: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "right",
    marginTop: 4,
  },
});
