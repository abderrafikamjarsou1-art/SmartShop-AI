import { Alert, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { useAuthStore } from "@/store/auth-store";
import { Button } from "../../components/ui";
import { Colors, Spacing, Typography } from "../../theme";

/**
 * TEMPORARY placeholder — the full Settings screen (profile, business info,
 * language, currency, theme, notifications, billing, security, help/about)
 * is design-phase work and hasn't started yet (see project plan).
 *
 * This minimal version exists only so logout is reachable/testable now
 * that the auth bridge is wired up. Replace entirely during the design pass.
 */
export default function SettingsScreen() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  function handleLogoutPress() {
    Alert.alert("تسجيل الخروج", "هل تريد تسجيل الخروج من حسابك؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "تسجيل الخروج",
        style: "destructive",
        onPress: async () => {
          await logout();
          // AuthGate handles the redirect to /(auth)/login once
          // isAuthenticated flips to false — no manual navigation needed.
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>الإعدادات</Text>

        {user ? (
          <View style={styles.userBlock}>
            <Text style={styles.userName}>{user.fullName ?? user.email}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
          </View>
        ) : null}

        <Text style={styles.placeholderNote}>
          باقي إعدادات الحساب والنشاط التجاري قيد الإنشاء.
        </Text>

        <Button
          title="تسجيل الخروج"
          onPress={handleLogoutPress}
          style={styles.logoutButton}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    padding: Spacing.lg,
  },
  title: {
    fontSize: Typography.h2,
    fontWeight: "800",
    color: Colors.text,
    textAlign: "right",
    marginBottom: Spacing.lg,
  },
  userBlock: {
    marginBottom: Spacing.lg,
    padding: Spacing.md,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  userName: {
    fontSize: Typography.body,
    fontWeight: "700",
    color: Colors.text,
    textAlign: "right",
  },
  userEmail: {
    marginTop: 4,
    fontSize: Typography.small,
    color: Colors.textSecondary,
    textAlign: "right",
  },
  placeholderNote: {
    marginBottom: Spacing.xl,
    color: Colors.textSecondary,
    fontSize: Typography.small,
    textAlign: "right",
  },
  logoutButton: {
    backgroundColor: Colors.danger,
  },
});
