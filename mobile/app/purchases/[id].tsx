import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowRight, Package, RotateCcw } from "lucide-react-native";

import {
  cancelPurchase,
  generateClientRef,
  getPurchase,
  getPurchaseErrorMessage,
  receivePurchase,
  returnPurchase,
  sendPurchase,
  type Purchase,
  type PurchaseStatus,
} from "@/services/purchases-service";
import ReceiveModal from "@/components/purchases/ReceiveModal";
import ReturnModal from "@/components/purchases/ReturnModal";

const COLORS = {
  background: "#F7F8FC",
  surface: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  border: "#E9ECF2",
  primary: "#5B5CE2",
  primarySoft: "#EEF0FF",
  warning: "#B45309",
  warningSoft: "#FFFBEB",
  success: "#16A34A",
  successSoft: "#ECFDF3",
  danger: "#DC2626",
  dangerSoft: "#FEF2F2",
};

const STATUS_STYLE: Record<PurchaseStatus, { label: string; color: string; bg: string }> = {
  DRAFT: { label: "مسودة", color: COLORS.muted, bg: "#F3F4F6" },
  ORDERED: { label: "مطلوب", color: COLORS.primary, bg: COLORS.primarySoft },
  PARTIALLY_RECEIVED: { label: "مستلم جزئيًا", color: COLORS.warning, bg: COLORS.warningSoft },
  RECEIVED: { label: "مستلم", color: COLORS.success, bg: COLORS.successSoft },
  CANCELLED: { label: "ملغى", color: COLORS.danger, bg: COLORS.dangerSoft },
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("ar-MA", { year: "numeric", month: "short", day: "numeric" });
}

export default function PurchaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isActing, setIsActing] = useState(false);
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (!id) return;
      if (mode === "initial") setIsLoading(true);
      if (mode === "refresh") setIsRefreshing(true);
      setErrorMessage(null);
      try {
        const result = await getPurchase(id);
        setPurchase(result);
      } catch (error) {
        setErrorMessage(getPurchaseErrorMessage(error, "تعذر تحميل طلب الشراء."));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [id]
  );

  useEffect(() => {
    load("initial");
  }, [load]);

  async function handleSend() {
    if (!purchase) return;
    setIsActing(true);
    try {
      const updated = await sendPurchase(purchase.id);
      setPurchase(updated);
    } catch (error) {
      Alert.alert("تعذر الإرسال", getPurchaseErrorMessage(error, "حدث خطأ غير متوقع."));
    } finally {
      setIsActing(false);
    }
  }

  function handleCancel() {
    if (!purchase) return;
    Alert.alert("إلغاء الطلب", "هل تريد إلغاء طلب الشراء هذا؟", [
      { text: "تراجع", style: "cancel" },
      {
        text: "إلغاء الطلب",
        style: "destructive",
        onPress: async () => {
          setIsActing(true);
          try {
            const updated = await cancelPurchase(purchase.id);
            setPurchase(updated);
          } catch (error) {
            Alert.alert("تعذر الإلغاء", getPurchaseErrorMessage(error, "حدث خطأ غير متوقع."));
          } finally {
            setIsActing(false);
          }
        },
      },
    ]);
  }

  async function handleReceiveSubmit(lines: { purchaseItemId: string; quantity: number }[], updateProductCost: boolean) {
    if (!purchase) return;
    setIsActing(true);
    try {
      const updated = await receivePurchase(purchase.id, {
        clientRef: generateClientRef(),
        items: lines,
        updateProductCost,
      });
      setPurchase(updated);
      setReceiveModalOpen(false);
    } catch (error) {
      Alert.alert("تعذر الاستلام", getPurchaseErrorMessage(error, "حدث خطأ غير متوقع."));
    } finally {
      setIsActing(false);
    }
  }

  async function handleReturnSubmit(lines: { purchaseItemId: string; quantity: number }[], reason: string) {
    if (!purchase) return;
    setIsActing(true);
    try {
      const updated = await returnPurchase(purchase.id, { items: lines, reason });
      setPurchase(updated);
      setReturnModalOpen(false);
    } catch (error) {
      Alert.alert("تعذر الإرجاع", getPurchaseErrorMessage(error, "حدث خطأ غير متوقع."));
    } finally {
      setIsActing(false);
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.centerState}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (errorMessage || !purchase) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{errorMessage ?? "تعذر تحميل طلب الشراء."}</Text>
          <Pressable style={styles.retryButton} onPress={() => load("initial")}>
            <RotateCcw size={16} color="#FFFFFF" strokeWidth={2.4} />
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const style = STATUS_STYLE[purchase.status];
  const hasReceivedItems = purchase.items.some((item) => item.receivedQuantity > 0);
  const canSend = purchase.status === "DRAFT";
  const canCancel = purchase.status === "DRAFT" || (purchase.status === "ORDERED" && !hasReceivedItems);
  const canReceive = purchase.status === "ORDERED" || purchase.status === "PARTIALLY_RECEIVED";
  const canReturn = purchase.items.some((item) => item.receivedQuantity > item.returnedQuantity);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: style.bg }]}>
          <Text style={[styles.badgeText, { color: style.color }]}>{style.label}</Text>
        </View>
        <Text style={styles.title}>PO-{String(purchase.purchaseNumber).padStart(4, "0")}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} hitSlop={8}>
          <ArrowRight size={22} color={COLORS.text} strokeWidth={2.2} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load("refresh")} tintColor={COLORS.primary} />}
      >
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoValue}>{purchase.supplier?.name ?? "بدون مورد"}</Text>
            <Text style={styles.infoLabel}>المورد</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoValue}>{formatDate(purchase.createdAt)}</Text>
            <Text style={styles.infoLabel}>تاريخ الإنشاء</Text>
          </View>
          {purchase.expectedAt ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoValue}>{formatDate(purchase.expectedAt)}</Text>
              <Text style={styles.infoLabel}>التاريخ المتوقع</Text>
            </View>
          ) : null}
          {purchase.notes ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoValue}>{purchase.notes}</Text>
              <Text style={styles.infoLabel}>ملاحظات</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.sectionLabel}>الأصناف ({purchase.items.length})</Text>
        <View style={styles.card}>
          {purchase.items.map((item, index) => (
            <View key={item.id} style={[styles.itemRow, index > 0 && styles.itemRowBorder]}>
              <View style={styles.itemTotals}>
                <Text style={styles.itemTotal}>{Number(item.total).toFixed(2)} د.م</Text>
                <Text style={styles.itemMeta}>
                  {item.receivedQuantity}/{item.quantity} مستلم
                  {item.returnedQuantity > 0 ? ` · ${item.returnedQuantity} مرتجع` : ""}
                </Text>
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.product.name}
                </Text>
                <Text style={styles.itemMeta}>
                  {item.quantity} × {Number(item.unitCost).toFixed(2)} د.م
                </Text>
              </View>
            </View>
          ))}
        </View>

        {purchase.receipts.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>سجل الاستلام</Text>
            <View style={styles.card}>
              {purchase.receipts.map((receipt, index) => (
                <View key={receipt.id} style={[styles.receiptRow, index > 0 && styles.itemRowBorder]}>
                  <Package size={16} color={COLORS.muted} strokeWidth={2} />
                  <View style={styles.receiptInfo}>
                    <Text style={styles.itemMeta}>
                      {receipt.lines.reduce((s, l) => s + l.quantity, 0)} وحدة — {formatDate(receipt.createdAt)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}

        <View style={styles.totalCard}>
          <Text style={styles.totalValue}>{Number(purchase.total).toFixed(2)} د.م</Text>
          <Text style={styles.totalLabel}>الإجمالي</Text>
        </View>
      </ScrollView>

      {(canSend || canCancel || canReceive || canReturn) && (
        <View style={styles.footer}>
          {canReceive ? (
            <Pressable style={[styles.footerButton, styles.footerButtonPrimary]} disabled={isActing} onPress={() => setReceiveModalOpen(true)}>
              <Text style={styles.footerButtonPrimaryText}>استلام بضاعة</Text>
            </Pressable>
          ) : null}
          {canSend ? (
            <Pressable style={[styles.footerButton, styles.footerButtonPrimary]} disabled={isActing} onPress={handleSend}>
              {isActing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.footerButtonPrimaryText}>إرسال للمورد</Text>}
            </Pressable>
          ) : null}
          <View style={styles.footerSecondaryRow}>
            {canReturn ? (
              <Pressable style={[styles.footerButton, styles.footerButtonSecondary, { flex: 1 }]} disabled={isActing} onPress={() => setReturnModalOpen(true)}>
                <Text style={styles.footerButtonSecondaryText}>إرجاع للمورد</Text>
              </Pressable>
            ) : null}
            {canCancel ? (
              <Pressable style={[styles.footerButton, styles.footerButtonDanger, { flex: 1 }]} disabled={isActing} onPress={handleCancel}>
                <Text style={styles.footerButtonDangerText}>إلغاء الطلب</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      )}

      <ReceiveModal
        visible={receiveModalOpen}
        items={purchase.items}
        isSubmitting={isActing}
        onClose={() => setReceiveModalOpen(false)}
        onSubmit={handleReceiveSubmit}
      />
      <ReturnModal
        visible={returnModalOpen}
        items={purchase.items}
        isSubmitting={isActing}
        onClose={() => setReturnModalOpen(false)}
        onSubmit={handleReturnSubmit}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  title: { color: COLORS.text, fontSize: 17, fontWeight: "800" },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: "800" },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  errorText: { color: COLORS.danger, fontSize: 14, fontWeight: "600", textAlign: "center", marginBottom: 16 },
  retryButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  retryText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  content: { paddingHorizontal: 18, paddingBottom: 40 },
  sectionLabel: {
    color: COLORS.text,
    fontSize: 13.5,
    fontWeight: "800",
    textAlign: "right",
    marginTop: 18,
    marginBottom: 8,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 14,
  },
  infoRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  infoLabel: { color: COLORS.muted, fontSize: 12.5, fontWeight: "600" },
  infoValue: { color: COLORS.text, fontSize: 13.5, fontWeight: "700", flexShrink: 1, textAlign: "left" },
  itemRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingVertical: 12,
    gap: 10,
  },
  itemRowBorder: { borderTopWidth: 1, borderTopColor: COLORS.border },
  itemInfo: { flex: 1, alignItems: "flex-end" },
  itemName: { color: COLORS.text, fontSize: 14, fontWeight: "700", textAlign: "right" },
  itemMeta: { color: COLORS.muted, fontSize: 11.5, marginTop: 2 },
  itemTotals: { alignItems: "flex-start" },
  itemTotal: { color: COLORS.text, fontSize: 13.5, fontWeight: "800" },
  receiptRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 12 },
  receiptInfo: { flex: 1, alignItems: "flex-end" },
  totalCard: {
    flexDirection: "row-reverse",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 18,
    paddingHorizontal: 4,
  },
  totalLabel: { color: COLORS.muted, fontSize: 13, fontWeight: "600" },
  totalValue: { color: COLORS.text, fontSize: 20, fontWeight: "800" },
  footer: {
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  footerSecondaryRow: { flexDirection: "row-reverse", gap: 10 },
  footerButton: { borderRadius: 14, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  footerButtonPrimary: { backgroundColor: COLORS.primary },
  footerButtonPrimaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  footerButtonSecondary: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  footerButtonSecondaryText: { color: COLORS.text, fontSize: 14, fontWeight: "700" },
  footerButtonDanger: { backgroundColor: COLORS.dangerSoft, borderWidth: 1, borderColor: COLORS.danger },
  footerButtonDangerText: { color: COLORS.danger, fontSize: 14, fontWeight: "700" },
});
