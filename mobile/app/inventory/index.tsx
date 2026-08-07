import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  ClipboardList,
  PackageX,
  RotateCcw,
  Wallet,
} from "lucide-react-native";

import { getInventoryDashboard, getInventoryErrorMessage, type InventoryDashboard } from "@/services/inventory-service";

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
  warning: "#B45309",
  warningSoft: "#FFFBEB",
  success: "#16A34A",
};

function money(value: number) {
  return `${value.toFixed(2)} د.م`;
}

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} س`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} ي`;
}

export default function InventoryOverviewScreen() {
  const [stats, setStats] = useState<InventoryDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setIsLoading(true);
    else setIsRefreshing(true);
    setErrorMessage(null);
    try {
      const result = await getInventoryDashboard();
      setStats(result);
    } catch (error) {
      setErrorMessage(getInventoryErrorMessage(error, "تعذر تحميل بيانات المخزون."));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load("initial");
  }, [load]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} hitSlop={8}>
          <ArrowRight size={22} color={COLORS.text} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.headerTitle}>المخزون</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="طلبات الشراء" onPress={() => router.push("/purchases")} hitSlop={8}>
          <ClipboardList size={22} color={COLORS.text} strokeWidth={2.2} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : errorMessage && !stats ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Pressable style={styles.retryButton} onPress={() => load("initial")}>
            <RotateCcw size={16} color="#FFFFFF" strokeWidth={2.4} />
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </Pressable>
        </View>
      ) : stats ? (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load("refresh")} tintColor={COLORS.primary} />}
        >
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: COLORS.primarySoft }]}>
                <Boxes size={18} color={COLORS.primary} strokeWidth={2.2} />
              </View>
              <Text style={styles.statValue}>{stats.totalProducts}</Text>
              <Text style={styles.statLabel}>إجمالي المنتجات</Text>
            </View>

            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: COLORS.primarySoft }]}>
                <Wallet size={18} color={COLORS.primary} strokeWidth={2.2} />
              </View>
              <Text style={styles.statValue}>{money(stats.retailValue)}</Text>
              <Text style={styles.statLabel}>قيمة المخزون (بيع)</Text>
            </View>

            <Pressable
              style={styles.statCard}
              onPress={() => router.push({ pathname: "/products", params: { stock: "low" } })}
            >
              <View style={[styles.statIcon, { backgroundColor: COLORS.warningSoft }]}>
                <AlertTriangle size={18} color={COLORS.warning} strokeWidth={2.2} />
              </View>
              <Text style={[styles.statValue, { color: COLORS.warning }]}>{stats.lowStockCount}</Text>
              <Text style={styles.statLabel}>مخزون منخفض</Text>
            </Pressable>

            <Pressable
              style={styles.statCard}
              onPress={() => router.push({ pathname: "/products", params: { stock: "out" } })}
            >
              <View style={[styles.statIcon, { backgroundColor: COLORS.dangerSoft }]}>
                <PackageX size={18} color={COLORS.danger} strokeWidth={2.2} />
              </View>
              <Text style={[styles.statValue, { color: COLORS.danger }]}>{stats.outOfStockCount}</Text>
              <Text style={styles.statLabel}>نفدت الكمية</Text>
            </Pressable>
          </View>

          <Pressable style={styles.movementsButton} onPress={() => router.push("/inventory/movements")}>
            <ClipboardList size={18} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={styles.movementsButtonText}>سجل حركات المخزون</Text>
          </Pressable>

          <Text style={styles.sectionTitle}>آخر التعديلات</Text>

          {stats.recentAdjustments.length === 0 ? (
            <Text style={styles.emptyText}>لا توجد تعديلات مخزون بعد.</Text>
          ) : (
            stats.recentAdjustments.map((adj) => (
              <View key={adj.id} style={styles.adjustmentRow}>
                <Text
                  style={[
                    styles.adjustmentDelta,
                    { color: adj.quantity >= 0 ? COLORS.success : COLORS.danger },
                  ]}
                >
                  {adj.quantity >= 0 ? `+${adj.quantity}` : adj.quantity}
                </Text>
                <View style={styles.adjustmentInfo}>
                  <Text style={styles.adjustmentName} numberOfLines={1}>
                    {adj.product.name}
                  </Text>
                  <Text style={styles.adjustmentMeta} numberOfLines={1}>
                    {adj.reason ?? "بدون سبب"} · {adj.user?.fullName ?? adj.user?.email ?? "النظام"}
                  </Text>
                </View>
                <Text style={styles.adjustmentTime}>{relativeTime(adj.createdAt)}</Text>
              </View>
            ))
          )}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
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
  content: {
    padding: 18,
    paddingBottom: 48,
  },
  statsGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    width: "47%",
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  statValue: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "right",
  },
  statLabel: {
    color: COLORS.muted,
    fontSize: 11.5,
    fontWeight: "600",
    textAlign: "right",
    marginTop: 3,
  },
  movementsButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 15,
    marginBottom: 24,
  },
  movementsButtonText: {
    color: "#FFFFFF",
    fontSize: 14.5,
    fontWeight: "800",
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
    textAlign: "right",
    marginBottom: 12,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 13,
    textAlign: "center",
    marginTop: 12,
  },
  adjustmentRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  adjustmentDelta: {
    fontSize: 14,
    fontWeight: "800",
    minWidth: 36,
    textAlign: "center",
  },
  adjustmentInfo: {
    flex: 1,
    alignItems: "flex-end",
  },
  adjustmentName: {
    color: COLORS.text,
    fontSize: 13.5,
    fontWeight: "700",
    textAlign: "right",
  },
  adjustmentMeta: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 2,
    textAlign: "right",
  },
  adjustmentTime: {
    color: COLORS.muted,
    fontSize: 10.5,
    fontWeight: "600",
  },
});
