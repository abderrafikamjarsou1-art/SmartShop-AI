import { StyleSheet, Text, View } from "react-native";
import type { InventoryDashboard } from "@/services/inventory-service";

type Props = {
  valuation: InventoryDashboard;
};

const COLORS = {
  text: "#111827",
  muted: "#6B7280",
  border: "#E9ECF2",
  primary: "#5B5CE2",
};

function money(value: number) {
  return `${value.toFixed(2)} د.م`;
}

export default function ValuationSection({ valuation }: Props) {
  const rows: { label: string; value: string }[] = [
    { label: "قيمة المخزون (تكلفة)", value: money(valuation.costValue) },
    { label: "قيمة المخزون (بيع)", value: money(valuation.retailValue) },
    { label: "إجمالي المنتجات", value: String(valuation.totalProducts) },
    { label: "نفدت الكمية", value: String(valuation.outOfStockCount) },
  ];

  return (
    <View>
      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <Text style={styles.value}>{row.value}</Text>
          <Text style={styles.label}>{row.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  label: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  value: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
  },
});
