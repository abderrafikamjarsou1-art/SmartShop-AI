import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CheckCircle2, X } from "lucide-react-native";
import type { Sale } from "@/services/sales-service";

type Props = {
  sale: Sale | null;
  onClose: () => void;
};

const COLORS = {
  overlay: "rgba(17, 24, 39, 0.5)",
  surface: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  border: "#E9ECF2",
  primary: "#5B5CE2",
  success: "#16A34A",
  successSoft: "#ECFDF3",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "نقدًا",
  CARD: "بطاقة",
  BANK_TRANSFER: "تحويل بنكي",
  STORE_CREDIT: "رصيد العميل",
};

function money(value: string | number) {
  return `${Number(value).toFixed(2)} د.م`;
}

export default function ReceiptModal({ sale, onClose }: Props) {
  return (
    <Modal visible={sale !== null} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {sale ? (
            <>
              <View style={styles.successIcon}>
                <CheckCircle2 size={40} color={COLORS.success} strokeWidth={2} />
              </View>
              <Text style={styles.successTitle}>تمت عملية البيع بنجاح</Text>
              <Text style={styles.saleNumber}>
                فاتورة رقم {sale.invoice?.invoiceNumber ?? sale.saleNumber} · بيع #{sale.saleNumber}
              </Text>

              <ScrollView style={styles.itemsScroll} showsVerticalScrollIndicator={false}>
                {sale.items.map((item) => (
                  <View key={item.id} style={styles.itemRow}>
                    <Text style={styles.itemTotal}>{money(item.total)}</Text>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {item.product.name}
                      </Text>
                      <Text style={styles.itemMeta}>
                        {item.quantity} × {money(item.unitPrice)}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>

              <View style={styles.summary}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryValue}>{money(sale.subtotal)}</Text>
                  <Text style={styles.summaryLabel}>المجموع الفرعي</Text>
                </View>
                {Number(sale.discountAmount) > 0 ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryValue}>-{money(sale.discountAmount)}</Text>
                    <Text style={styles.summaryLabel}>الخصم</Text>
                  </View>
                ) : null}
                {Number(sale.taxAmount) > 0 ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryValue}>{money(sale.taxAmount)}</Text>
                    <Text style={styles.summaryLabel}>الضريبة ({Number(sale.taxRate)}%)</Text>
                  </View>
                ) : null}
                <View style={[styles.summaryRow, styles.totalRow]}>
                  <Text style={styles.totalValue}>{money(sale.total)}</Text>
                  <Text style={styles.totalLabel}>الإجمالي</Text>
                </View>

                {sale.payments.map((payment) => (
                  <View key={payment.id} style={styles.summaryRow}>
                    <Text style={styles.summaryValue}>{money(payment.amount)}</Text>
                    <Text style={styles.summaryLabel}>
                      {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
                    </Text>
                  </View>
                ))}

                {Number(sale.amountPaid) > Number(sale.total) ? (
                  <View style={[styles.summaryRow, styles.changeRow]}>
                    <Text style={styles.changeValue}>
                      {money(Number(sale.amountPaid) - Number(sale.total))}
                    </Text>
                    <Text style={styles.changeLabel}>الباقي للعميل</Text>
                  </View>
                ) : null}
              </View>

              <Pressable style={styles.doneButton} onPress={onClose}>
                <Text style={styles.doneButtonText}>عملية بيع جديدة</Text>
              </Pressable>
            </>
          ) : null}

          <Pressable style={styles.closeIcon} onPress={onClose} accessibilityRole="button" accessibilityLabel="إغلاق">
            <X size={20} color={COLORS.muted} strokeWidth={2.2} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: "center",
    padding: 20,
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderRadius: 28,
    padding: 24,
    maxHeight: "85%",
  },
  closeIcon: {
    position: "absolute",
    top: 16,
    left: 16,
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.successSoft,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 14,
  },
  successTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 4,
  },
  saleNumber: {
    color: COLORS.muted,
    fontSize: 12.5,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 18,
  },
  itemsScroll: {
    maxHeight: 180,
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  itemInfo: {
    flex: 1,
    marginRight: 10,
    alignItems: "flex-end",
  },
  itemName: {
    color: COLORS.text,
    fontSize: 13.5,
    fontWeight: "700",
    textAlign: "right",
  },
  itemMeta: {
    color: COLORS.muted,
    fontSize: 11.5,
    marginTop: 2,
  },
  itemTotal: {
    color: COLORS.text,
    fontSize: 13.5,
    fontWeight: "700",
  },
  summary: {
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 14,
    marginBottom: 18,
  },
  summaryRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  summaryLabel: {
    color: COLORS.muted,
    fontSize: 12.5,
    fontWeight: "600",
  },
  summaryValue: {
    color: COLORS.text,
    fontSize: 12.5,
    fontWeight: "700",
  },
  totalRow: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  totalLabel: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
  },
  totalValue: {
    color: COLORS.primary,
    fontSize: 17,
    fontWeight: "800",
  },
  changeRow: {
    marginTop: 4,
  },
  changeLabel: {
    color: COLORS.success,
    fontSize: 12.5,
    fontWeight: "700",
  },
  changeValue: {
    color: COLORS.success,
    fontSize: 12.5,
    fontWeight: "800",
  },
  doneButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
  },
  doneButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});
