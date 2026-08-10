import { StyleSheet, Text, View } from "react-native";
import type { WeeklySeriesPoint } from "@/services/dashboard-service";

type Props = {
  data: WeeklySeriesPoint[];
};

const COLORS = {
  surface: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  primary: "#5B5CE2",
  track: "#EEF0FF",
};

export default function SalesChart({ data }: Props) {
  const max = Math.max(1, ...data.map((d) => d.sales));
  const total = data.reduce((sum, d) => sum + d.sales, 0);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.total}>{total}</Text>
        <Text style={styles.title}>مبيعات هذا الأسبوع</Text>
      </View>

      {total === 0 ? (
        <Text style={styles.emptyText}>لا توجد مبيعات هذا الأسبوع بعد.</Text>
      ) : (
        <View style={styles.chart}>
          {data.map((point, index) => (
            <View key={`${point.day}-${index}`} style={styles.barColumn}>
              <View style={styles.track}>
                <View
                  style={[
                    styles.bar,
                    { height: `${Math.max(6, (point.sales / max) * 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.barValue}>{point.sales}</Text>
              <Text style={styles.barLabel}>{point.day}</Text>
            </View>
          ))}
        </View>
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
  headerRow: {
    flexDirection: "row-reverse",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
  },
  total: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.primary,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 24,
  },
  chart: {
    height: 140,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  barColumn: {
    flex: 1,
    alignItems: "center",
  },
  track: {
    width: 20,
    height: 90,
    borderRadius: 8,
    backgroundColor: COLORS.track,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  bar: {
    width: "100%",
    backgroundColor: COLORS.primary,
    borderRadius: 8,
  },
  barValue: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.text,
    marginTop: 6,
  },
  barLabel: {
    fontSize: 10,
    color: COLORS.muted,
    marginTop: 2,
  },
});
