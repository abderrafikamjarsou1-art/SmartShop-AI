import { View, Text, StyleSheet, Pressable } from "react-native";
import { router } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import { Boxes, Package, Receipt, ShoppingCart, Sparkles, Users } from "lucide-react-native";

/**
 * Only links to screens that actually exist. Customers was re-added
 * once /customers existed, Expenses once /expenses existed, and AI is
 * back now that /ai exists too. Grid wraps (styles.grid/styles.card)
 * so extra tiles just flow onto another row of three.
 */
const actions: { title: string; icon: LucideIcon; onPress: () => void }[] = [
  {
    title: "بيع جديد",
    icon: ShoppingCart,
    onPress: () => router.push("/(tabs)/pos"),
  },
  {
    title: "منتج جديد",
    icon: Package,
    onPress: () => router.push("/products/new"),
  },
  {
    title: "العملاء",
    icon: Users,
    onPress: () => router.push("/customers"),
  },
  {
    title: "المخزون",
    icon: Boxes,
    onPress: () => router.push("/inventory"),
  },
  {
    title: "المصاريف",
    icon: Receipt,
    onPress: () => router.push("/expenses"),
  },
  {
    title: "المساعد الذكي",
    icon: Sparkles,
    onPress: () => router.push("/ai"),
  },
];

export default function QuickActions() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>إجراءات سريعة</Text>

      <View style={styles.grid}>
        {actions.map((item) => {
          const Icon = item.icon;

          return (
            <Pressable
              key={item.title}
              onPress={item.onPress}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <Icon color="#5B5CE2" size={26} strokeWidth={2.1} />
              <Text style={styles.label}>{item.title}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 22,
    paddingHorizontal: 18,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
    color: "#111827",
    textAlign: "right",
  },
  grid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 10,
  },
  card: {
    width: "31%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  cardPressed: {
    opacity: 0.8,
  },
  label: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    color: "#374151",
  },
});
