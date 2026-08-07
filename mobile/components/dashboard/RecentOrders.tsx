import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { ReceiptText } from "lucide-react-native";
import type { RecentSale } from "@/services/dashboard-service";

type Props = {
  sales: RecentSale[];
};

const COLORS = {
  surface: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  border: "#E9ECF2",
  primary: "#5B5CE2",
  success: "#16A34A",
  successSoft: "#ECFDF3",
  warning: "#B45309",
  warningSoft: "#FFFBEB",
  danger: "#6B7280",
  dangerSoft: "#F3F4F6",
};

const PAYMENT_STATUS: Record<RecentSale["paymentStatus"], { label: string; color: string; bg: string }> = {
  PAID: { label: "مدفوع", color: COLORS.success, bg: COLORS.successSoft },
  PARTIAL: { label: "جزئي", color: COLORS.warning, bg: COLORS.warningSoft },
  PENDING: { label: "غير مدفوع", color: COLORS.danger, bg: COLORS.dangerSoft },
  REFUNDED: { label: "مسترجع", color: COLORS.danger, bg: COLORS.dangerSoft },
};

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

export default function RecentOrders({ sales }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>آخر المبيعات</Text>

      {sales.length === 0 ? (
        <View style={styles.emptyState}>
          <ReceiptText size={28} color={COLORS.primary} strokeWidth={1.6} />
          <Text style={styles.emptyText}>لا توجد مبيعات بعد.</Text>
        </View>
      ) : (
        sales.map((sale) => {
          const status = PAYMENT_STATUS[sale.paymentStatus];
          return (
            <Pressable
              key={sale.id}
              style={styles.row}
              onPress={() => router.push("/(tabs)/pos")}
            >
              <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
              </View>

              <Text style={styles.total}>{sale.total.toFixed(2)} د.م</Text>

              <View style={styles.rowInfo}>
                <Text style={styles.customer} numberOfLines={1}>
                  {sale.customer}
                </Text>
                <Text style={styles.meta}>
                  {sale.number} · {sale.items} صنف · {relativeTime(sale.createdAt)}
                </Text>
              </View>
            </Pressable>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 18,
    marginTop: 18,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 18,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "right",
    marginBottom: 12,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 8,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 13,
  },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  rowInfo: {
    flex: 1,
    alignItems: "flex-end",
  },
  customer: {
    color: COLORS.text,
    fontSize: 13.5,
    fontWeight: "700",
    textAlign: "right",
  },
  meta: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 2,
    textAlign: "right",
  },
  total: {
    color: COLORS.text,
    fontSize: 13.5,
    fontWeight: "800",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 10.5,
    fontWeight: "800",
  },
});
