import { StyleSheet, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { ArrowDownRight, ArrowUpRight } from "lucide-react-native";

type Props = {
  title: string;
  value: string;
  icon?: LucideIcon;
  trend?: number;
  helperText?: string;
};

const COLORS = {
  surface: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  border: "#E9ECF2",
  primary: "#5B5CE2",
  primarySoft: "#EEF0FF",
  success: "#16A34A",
  successSoft: "#ECFDF3",
  danger: "#DC2626",
  dangerSoft: "#FEF2F2",
};

export default function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  helperText,
}: Props) {
  const hasTrend = typeof trend === "number";
  const isPositive = hasTrend && trend >= 0;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.iconWrap}>
          {Icon ? (
            <Icon
              size={19}
              strokeWidth={2.2}
              color={COLORS.primary}
            />
          ) : (
            <View style={styles.iconDot} />
          )}
        </View>

        {hasTrend ? (
          <View
            style={[
              styles.trendBadge,
              isPositive
                ? styles.trendBadgePositive
                : styles.trendBadgeNegative,
            ]}
          >
            {isPositive ? (
              <ArrowUpRight
                size={13}
                strokeWidth={2.4}
                color={COLORS.success}
              />
            ) : (
              <ArrowDownRight
                size={13}
                strokeWidth={2.4}
                color={COLORS.danger}
              />
            )}

            <Text
              style={[
                styles.trendText,
                isPositive
                  ? styles.trendTextPositive
                  : styles.trendTextNegative,
              ]}
            >
              {Math.abs(trend)}%
            </Text>
          </View>
        ) : null}
      </View>

      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={styles.value}
      >
        {value}
      </Text>

      <Text numberOfLines={1} style={styles.title}>
        {title}
      </Text>

      {helperText ? (
        <Text numberOfLines={1} style={styles.helperText}>
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 148,
    padding: 16,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#111827",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 3,
  },

  topRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },

  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.primarySoft,
  },

  iconDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },

  trendBadge: {
    minHeight: 28,
    paddingHorizontal: 8,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },

  trendBadgePositive: {
    backgroundColor: COLORS.successSoft,
  },

  trendBadgeNegative: {
    backgroundColor: COLORS.dangerSoft,
  },

  trendText: {
    fontSize: 11,
    fontWeight: "800",
  },

  trendTextPositive: {
    color: COLORS.success,
  },

  trendTextNegative: {
    color: COLORS.danger,
  },

  value: {
    color: COLORS.text,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: "800",
    textAlign: "right",
    letterSpacing: -0.4,
  },

  title: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
    textAlign: "right",
    marginTop: 5,
  },

  helperText: {
    color: "#9CA3AF",
    fontSize: 11,
    lineHeight: 17,
    textAlign: "right",
    marginTop: 3,
  },
});