import { StyleSheet, Text, View } from "react-native";
import { Trophy } from "lucide-react-native";
import type { TopProduct } from "@/services/dashboard-service";

type Props = {
  products: TopProduct[];
};

const COLORS = {
  surface: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  border: "#E9ECF2",
  primary: "#5B5CE2",
  primarySoft: "#EEF0FF",
};

export default function TopProducts({ products }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>الأكثر مبيعًا هذا الشهر</Text>

      {products.length === 0 ? (
        <View style={styles.emptyState}>
          <Trophy size={28} color={COLORS.primary} strokeWidth={1.6} />
          <Text style={styles.emptyText}>لا توجد مبيعات كافية بعد لعرض الأكثر مبيعًا.</Text>
        </View>
      ) : (
        products.map((product, index) => (
          <View key={`${product.name}-${index}`} style={styles.row}>
            <Text style={styles.revenue}>{product.revenue.toFixed(2)} د.م</Text>

            <View style={styles.rowInfo}>
              <Text style={styles.name} numberOfLines={1}>
                {product.name}
              </Text>
              <Text style={styles.meta}>{product.units} وحدة مباعة</Text>
            </View>

            <View style={styles.rank}>
              <Text style={styles.rankText}>{index + 1}</Text>
            </View>
          </View>
        ))
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
    textAlign: "center",
  },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  rank: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  rowInfo: {
    flex: 1,
    alignItems: "flex-end",
  },
  name: {
    color: COLORS.text,
    fontSize: 13.5,
    fontWeight: "700",
    textAlign: "right",
  },
  meta: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 2,
  },
  revenue: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
});
