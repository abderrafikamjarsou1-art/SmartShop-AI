import { Pencil, Tag, Trash2 } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Product } from "@/services/products-service";

type Props = {
  product: Product;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

const COLORS = {
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
  successSoft: "#ECFDF3",
};

function stockTone(product: Product): { label: string; color: string; background: string } {
  if (product.quantity <= 0) {
    return { label: "نفد المخزون", color: COLORS.danger, background: COLORS.dangerSoft };
  }
  if (product.quantity <= product.minimumStock) {
    return { label: "مخزون منخفض", color: COLORS.warning, background: COLORS.warningSoft };
  }
  return { label: "متوفر", color: COLORS.success, background: COLORS.successSoft };
}

export default function ProductCard({ product, onPress, onEdit, onDelete }: Props) {
  const stock = stockTone(product);
  const price = Number(product.sellingPrice);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.topRow}>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="حذف المنتج"
            hitSlop={8}
            onPress={onDelete}
            style={styles.iconButton}
          >
            <Trash2 size={16} strokeWidth={2.2} color={COLORS.danger} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="تعديل المنتج"
            hitSlop={8}
            onPress={onEdit}
            style={styles.iconButton}
          >
            <Pencil size={16} strokeWidth={2.2} color={COLORS.primary} />
          </Pressable>
        </View>

        <View style={[styles.stockBadge, { backgroundColor: stock.background }]}>
          <Text style={[styles.stockBadgeText, { color: stock.color }]}>{stock.label}</Text>
        </View>
      </View>

      <Text numberOfLines={1} style={styles.name}>
        {product.name}
      </Text>

      <View style={styles.metaRow}>
        {product.sku ? <Text style={styles.metaText}>SKU: {product.sku}</Text> : null}
        {product.category ? (
          <View style={styles.categoryChip}>
            <Tag size={11} strokeWidth={2.2} color={COLORS.primary} />
            <Text style={styles.categoryText}>{product.category.name}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.bottomRow}>
        <View style={styles.quantityWrap}>
          <Text style={styles.quantityValue}>{product.quantity}</Text>
          <Text style={styles.quantityLabel}>الكمية</Text>
        </View>

        <Text style={styles.price}>{price.toFixed(2)} د.م</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#111827",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  pressed: {
    opacity: 0.85,
  },
  topRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primarySoft,
  },
  stockBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  stockBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  name: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "right",
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  metaText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  categoryChip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  categoryText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "700",
  },
  bottomRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
  },
  quantityWrap: {
    alignItems: "flex-end",
  },
  quantityValue: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
  },
  quantityLabel: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "600",
    marginTop: 1,
  },
  price: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: "800",
  },
});
