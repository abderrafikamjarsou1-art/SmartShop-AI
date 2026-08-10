import { StyleSheet, Text, View } from "react-native";
import { PackageCheck } from "lucide-react-native";
import type { Product } from "@/services/products-service";

type Props = {
  products: Product[];
};

const COLORS = {
  text: "#111827",
  muted: "#6B7280",
  border: "#E9ECF2",
  primary: "#5B5CE2",
  warning: "#B45309",
  warningSoft: "#FFFBEB",
  danger: "#DC2626",
  dangerSoft: "#FEF2F2",
  success: "#16A34A",
};

export default function LowStockSection({ products }: Props) {
  if (products.length === 0) {
    return (
      <View style={styles.emptyState}>
        <PackageCheck size={28} color={COLORS.success} strokeWidth={1.8} />
        <Text style={styles.emptyText}>لا توجد منتجات منخفضة المخزون.</Text>
      </View>
    );
  }

  return (
    <View>
      {products.map((product) => {
        const isOut = product.quantity <= 0;
        return (
          <View key={product.id} style={styles.row}>
            <View
              style={[
                styles.badge,
                { backgroundColor: isOut ? COLORS.dangerSoft : COLORS.warningSoft },
              ]}
            >
              <Text style={[styles.badgeText, { color: isOut ? COLORS.danger : COLORS.warning }]}>
                {product.quantity} / {product.minimumStock}
              </Text>
            </View>

            <View style={styles.rowInfo}>
              <Text style={styles.name} numberOfLines={1}>
                {product.name}
              </Text>
              {product.sku ? <Text style={styles.sku}>{product.sku}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
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
  name: {
    color: COLORS.text,
    fontSize: 13.5,
    fontWeight: "700",
    textAlign: "right",
  },
  sku: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
});
