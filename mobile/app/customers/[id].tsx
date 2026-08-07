import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowRight, Pencil, Phone, Mail, MapPin, RotateCcw, Trash2, Wallet } from "lucide-react-native";

import CustomerForm, { type CustomerFormValues } from "@/components/customers/CustomerForm";
import RecordPaymentModal from "@/components/customers/RecordPaymentModal";
import {
  deleteCustomer,
  getCustomerErrorMessage,
  getCustomerFieldErrors,
  getCustomerProfile,
  updateCustomer,
  type CustomerProfile,
  type UpdateCustomerInput,
} from "@/services/customers-service";

const COLORS = {
  background: "#F7F8FC",
  surface: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  border: "#E9ECF2",
  primary: "#5B5CE2",
  primarySoft: "#EEF0FF",
  danger: "#DC2626",
  dangerSoft: "#FEF2F2",
  success: "#16A34A",
  successSoft: "#ECFDF3",
};

function money(value: number | string) {
  return `${Number(value).toFixed(2)} د.م`;
}

function profileToFormValues(profile: CustomerProfile): CustomerFormValues {
  const c = profile.customer;
  return {
    name: c.name,
    phone: c.phone ?? "",
    email: c.email ?? "",
    address: c.address ?? "",
    notes: c.notes ?? "",
    tags: c.tags.join(", "),
  };
}

function toUpdateInput(values: CustomerFormValues): UpdateCustomerInput {
  return {
    name: values.name.trim(),
    phone: values.phone.trim() || undefined,
    email: values.email.trim() || undefined,
    address: values.address.trim() || undefined,
    notes: values.notes.trim() || undefined,
    tags: values.tags.split(",").map((t) => t.trim()).filter(Boolean),
  };
}

export default function CustomerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [values, setValues] = useState<CustomerFormValues | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [paymentModalVisible, setPaymentModalVisible] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await getCustomerProfile(id);
      setProfile(result);
    } catch (error) {
      setLoadError(getCustomerErrorMessage(error, "تعذر تحميل بيانات العميل."));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function startEditing() {
    if (!profile) return;
    setValues(profileToFormValues(profile));
    setErrorMessage(null);
    setFieldErrors({});
    setIsEditing(true);
  }

  async function handleSaveEdit() {
    if (!values || !profile || submitting) return;
    try {
      setSubmitting(true);
      setErrorMessage(null);
      setFieldErrors({});
      const updated = await updateCustomer(profile.customer.id, toUpdateInput(values));
      setProfile({ ...profile, customer: updated });
      setIsEditing(false);
    } catch (error) {
      setFieldErrors(getCustomerFieldErrors(error));
      setErrorMessage(getCustomerErrorMessage(error, "تعذر حفظ التعديلات."));
    } finally {
      setSubmitting(false);
    }
  }

  function handleDelete() {
    if (!profile) return;
    Alert.alert("حذف العميل", `هل أنت متأكد من حذف "${profile.customer.name}"؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteCustomer(profile.customer.id);
            router.back();
          } catch (error) {
            Alert.alert("تعذر الحذف", getCustomerErrorMessage(error, "حدث خطأ أثناء حذف العميل."));
          }
        },
      },
    ]);
  }

  const outstandingBalance = profile ? Number(profile.customer.outstandingBalance) : 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} hitSlop={8}>
          <ArrowRight size={22} color={COLORS.text} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {profile?.customer.name ?? "العميل"}
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="حذف"
            onPress={handleDelete}
            disabled={!profile}
            style={styles.iconButton}
          >
            <Trash2 size={18} color={COLORS.danger} strokeWidth={2.2} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="تعديل"
            onPress={startEditing}
            disabled={!profile}
            style={styles.iconButton}
          >
            <Pencil size={18} color={COLORS.primary} strokeWidth={2.2} />
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : loadError ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{loadError}</Text>
          <Pressable style={styles.retryButton} onPress={load}>
            <RotateCcw size={16} color="#FFFFFF" strokeWidth={2.4} />
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </Pressable>
        </View>
      ) : profile ? (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {isEditing && values ? (
              <View style={styles.card}>
                {errorMessage ? <Text style={styles.errorBanner}>{errorMessage}</Text> : null}
                <CustomerForm
                  values={values}
                  onChange={setValues}
                  fieldErrors={fieldErrors}
                  submitting={submitting}
                  submitLabel="حفظ التعديلات"
                  onSubmit={handleSaveEdit}
                />
                <Pressable style={styles.cancelButton} onPress={() => setIsEditing(false)} disabled={submitting}>
                  <Text style={styles.cancelButtonText}>إلغاء</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.card}>
                  {profile.customer.phone ? (
                    <View style={styles.contactRow}>
                      <Phone size={15} color={COLORS.muted} strokeWidth={2.2} />
                      <Text style={styles.contactText}>{profile.customer.phone}</Text>
                    </View>
                  ) : null}
                  {profile.customer.email ? (
                    <View style={styles.contactRow}>
                      <Mail size={15} color={COLORS.muted} strokeWidth={2.2} />
                      <Text style={styles.contactText}>{profile.customer.email}</Text>
                    </View>
                  ) : null}
                  {profile.customer.address ? (
                    <View style={styles.contactRow}>
                      <MapPin size={15} color={COLORS.muted} strokeWidth={2.2} />
                      <Text style={styles.contactText}>{profile.customer.address}</Text>
                    </View>
                  ) : null}
                  {profile.customer.tags.length > 0 ? (
                    <View style={styles.tagsRow}>
                      {profile.customer.tags.map((tag) => (
                        <View key={tag} style={styles.tagChip}>
                          <Text style={styles.tagChipText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>

                <View style={styles.kpiGrid}>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiValue}>{money(profile.kpis.ltv)}</Text>
                    <Text style={styles.kpiLabel}>إجمالي المشتريات</Text>
                  </View>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiValue}>{profile.kpis.orders}</Text>
                    <Text style={styles.kpiLabel}>عدد الطلبات</Text>
                  </View>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiValue}>{money(profile.kpis.aov)}</Text>
                    <Text style={styles.kpiLabel}>متوسط الطلب</Text>
                  </View>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiValue} numberOfLines={1}>
                      {profile.kpis.lastPurchase
                        ? new Date(profile.kpis.lastPurchase).toLocaleDateString("ar-MA")
                        : "—"}
                    </Text>
                    <Text style={styles.kpiLabel}>آخر شراء</Text>
                  </View>
                </View>

                <View style={[styles.card, styles.balanceCard]}>
                  <View style={styles.balanceRow}>
                    <View style={styles.balanceItem}>
                      <Text style={[styles.balanceValue, outstandingBalance > 0 && { color: COLORS.danger }]}>
                        {money(outstandingBalance)}
                      </Text>
                      <Text style={styles.balanceLabel}>مستحق</Text>
                    </View>
                    <View style={styles.balanceItem}>
                      <Text style={[styles.balanceValue, Number(profile.customer.storeCredit) > 0 && { color: COLORS.success }]}>
                        {money(profile.customer.storeCredit)}
                      </Text>
                      <Text style={styles.balanceLabel}>رصيد العميل</Text>
                    </View>
                  </View>

                  {outstandingBalance > 0 ? (
                    <Pressable style={styles.paymentButton} onPress={() => setPaymentModalVisible(true)}>
                      <Wallet size={16} color="#FFFFFF" strokeWidth={2.2} />
                      <Text style={styles.paymentButtonText}>تسجيل دفعة</Text>
                    </Pressable>
                  ) : null}
                </View>

                {profile.favorites.length > 0 ? (
                  <>
                    <Text style={styles.sectionTitle}>المنتجات المفضلة</Text>
                    <View style={styles.card}>
                      {profile.favorites.map((f, i) => (
                        <View key={`${f.name}-${i}`} style={styles.listRow}>
                          <Text style={styles.listRowMeta}>{f.units} وحدة</Text>
                          <Text style={styles.listRowTitle} numberOfLines={1}>
                            {f.name}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}

                <Text style={styles.sectionTitle}>آخر المبيعات</Text>
                <View style={styles.card}>
                  {profile.recentSales.length === 0 ? (
                    <Text style={styles.emptyText}>لا توجد مبيعات بعد.</Text>
                  ) : (
                    profile.recentSales.map((sale) => (
                      <Pressable key={sale.id} style={styles.listRow} onPress={() => router.push("/(tabs)/pos")}>
                        <Text style={styles.listRowMeta}>{money(sale.total)}</Text>
                        <Text style={styles.listRowTitle}>
                          S-{String(sale.saleNumber).padStart(4, "0")} ·{" "}
                          {new Date(sale.createdAt).toLocaleDateString("ar-MA")}
                        </Text>
                      </Pressable>
                    ))
                  )}
                </View>

                <Text style={styles.sectionTitle}>آخر الدفعات</Text>
                <View style={styles.card}>
                  {profile.payments.length === 0 ? (
                    <Text style={styles.emptyText}>لا توجد دفعات بعد.</Text>
                  ) : (
                    profile.payments.map((payment) => (
                      <View key={payment.id} style={styles.listRow}>
                        <Text style={[styles.listRowMeta, { color: COLORS.success }]}>{money(payment.amount)}</Text>
                        <Text style={styles.listRowTitle}>
                          {new Date(payment.createdAt).toLocaleDateString("ar-MA")}
                          {payment.reference ? ` · ${payment.reference}` : ""}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : null}

      {profile ? (
        <RecordPaymentModal
          visible={paymentModalVisible}
          customerId={profile.customer.id}
          outstandingBalance={outstandingBalance}
          onClose={() => setPaymentModalVisible(false)}
          onRecorded={() => {
            setPaymentModalVisible(false);
            load();
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  headerTitle: {
    flex: 1,
    marginHorizontal: 12,
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "800",
    textAlign: "right",
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primarySoft,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 21,
  },
  retryButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  retryText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  content: {
    padding: 18,
    paddingBottom: 48,
  },
  errorBanner: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 16,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
  },
  cancelButton: {
    marginTop: 10,
    alignItems: "center",
    paddingVertical: 10,
  },
  cancelButtonText: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  contactRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  contactText: {
    color: COLORS.text,
    fontSize: 13.5,
    fontWeight: "600",
  },
  tagsRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  tagChip: {
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  tagChipText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "700",
  },
  kpiGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  kpiCard: {
    width: "47%",
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  kpiValue: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "800",
    textAlign: "right",
  },
  kpiLabel: {
    color: COLORS.muted,
    fontSize: 11.5,
    fontWeight: "600",
    textAlign: "right",
    marginTop: 4,
  },
  balanceCard: {
    alignItems: "center",
  },
  balanceRow: {
    flexDirection: "row-reverse",
    width: "100%",
    justifyContent: "space-around",
    marginBottom: 4,
  },
  balanceItem: {
    alignItems: "center",
  },
  balanceValue: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: "800",
  },
  balanceLabel: {
    color: COLORS.muted,
    fontSize: 11.5,
    fontWeight: "600",
    marginTop: 4,
  },
  paymentButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginTop: 14,
  },
  paymentButtonText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "800",
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
    textAlign: "right",
    marginBottom: 10,
  },
  listRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  listRowTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
    flexShrink: 1,
  },
  listRowMeta: {
    color: COLORS.text,
    fontSize: 12.5,
    fontWeight: "700",
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 12.5,
    textAlign: "center",
    paddingVertical: 10,
  },
});
