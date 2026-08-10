import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Link, router } from "expo-router";
import { LockKeyhole, Mail, Store, Sparkles, User as UserIcon } from "lucide-react-native";

import { useAuthStore } from "@/store/auth-store";
import { getAuthErrorMessage, registerRequest } from "@/services/auth-service";

import { Button, Card, Input } from "../../components/ui";
import { Colors, Radius, Shadows, Spacing, Typography } from "../../theme";

const PASSWORD_MIN_LENGTH = 8;

export default function RegisterScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const login = useAuthStore((state) => state.login);

  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const passwordLongEnough = password.length >= PASSWORD_MIN_LENGTH;

  const canSubmit =
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    passwordLongEnough &&
    passwordsMatch;

  async function handleRegister() {
    if (loading) return; // prevent double-tap re-entry
    if (!canSubmit) return;

    const normalizedEmail = email.trim().toLowerCase();

    try {
      setLoading(true);
      setErrorMessage(null);

      const result = await registerRequest({
        fullName: fullName.trim(),
        email: normalizedEmail,
        password,
      });

      if (result.needsVerification || !result.token) {
        // Supabase requires email confirmation before a session exists —
        // there is no token to log in with yet. Send the user to login
        // with a clear explanation instead of a broken "logged in" state.
        router.replace({
          pathname: "/(auth)/login",
          params: { verifyEmail: normalizedEmail },
        });
        return;
      }

      await login(result.user, result.token);
      router.replace("/(tabs)");
    } catch (error) {
      setErrorMessage(
        getAuthErrorMessage(error, "تعذر إنشاء الحساب. حاول مجددًا.")
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.backgroundOrbTop} />
        <View style={styles.backgroundOrbBottom} />

        <View style={styles.container}>
          <View style={styles.brandSection}>
            <View style={styles.logo}>
              <Store color="#FFFFFF" size={28} />
            </View>

            <View style={styles.brandRow}>
              <Text style={styles.brandName}>SmartShop AI</Text>
              <Sparkles color={Colors.primary} size={20} />
            </View>

            <Text style={styles.tagline}>أنشئ حسابك وابدأ إدارة متجرك بذكاء.</Text>
          </View>

          <Card style={styles.card}>
            <Text style={styles.title}>إنشاء حساب جديد</Text>
            <Text style={styles.subtitle}>
              املأ البيانات التالية لإنشاء حسابك في SmartShop AI.
            </Text>

            <View style={styles.field}>
              <View style={styles.fieldHeader}>
                <UserIcon color={Colors.textSecondary} size={18} />
                <Text style={styles.fieldLabel}>الاسم الكامل</Text>
              </View>

              <Input
                value={fullName}
                onChangeText={setFullName}
                placeholder="الاسم الكامل"
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>

            <View style={styles.field}>
              <View style={styles.fieldHeader}>
                <Mail color={Colors.textSecondary} size={18} />
                <Text style={styles.fieldLabel}>البريد الإلكتروني</Text>
              </View>

              <Input
                value={email}
                onChangeText={setEmail}
                placeholder="name@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.field}>
              <View style={styles.fieldHeader}>
                <LockKeyhole color={Colors.textSecondary} size={18} />
                <Text style={styles.fieldLabel}>كلمة المرور</Text>
              </View>

              <Input
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry
              />

              {password.length > 0 && !passwordLongEnough ? (
                <Text style={styles.hintText}>
                  يجب أن تحتوي كلمة المرور على {PASSWORD_MIN_LENGTH} أحرف على الأقل.
                </Text>
              ) : null}
            </View>

            <View style={styles.field}>
              <View style={styles.fieldHeader}>
                <LockKeyhole color={Colors.textSecondary} size={18} />
                <Text style={styles.fieldLabel}>تأكيد كلمة المرور</Text>
              </View>

              <Input
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="••••••••"
                secureTextEntry
              />

              {confirmPassword.length > 0 && !passwordsMatch ? (
                <Text style={styles.hintText}>كلمتا المرور غير متطابقتين.</Text>
              ) : null}
            </View>

            {errorMessage ? (
              <Text style={styles.errorText}>{errorMessage}</Text>
            ) : null}

            <Button
              title="إنشاء الحساب"
              loading={loading}
              disabled={!canSubmit}
              onPress={handleRegister}
              style={styles.submitButton}
            />

            <View style={styles.loginRow}>
              <Text style={styles.loginPrompt}>لديك حساب بالفعل؟</Text>
              <Link href="/(auth)/login" asChild>
                <Pressable>
                  <Text style={styles.loginLink}>تسجيل الدخول</Text>
                </Pressable>
              </Link>
            </View>
          </Card>

          <Text style={styles.footer}>© {new Date().getFullYear()} SmartShop AI</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboard: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  backgroundOrbTop: {
    position: "absolute",
    top: -90,
    right: -70,
    width: 230,
    height: 230,
    borderRadius: Radius.full,
    backgroundColor: "#D1FAE5",
    opacity: 0.75,
  },
  backgroundOrbBottom: {
    position: "absolute",
    bottom: -110,
    left: -80,
    width: 250,
    height: 250,
    borderRadius: Radius.full,
    backgroundColor: "#DBEAFE",
    opacity: 0.55,
  },
  brandSection: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    ...Shadows.card,
  },
  brandRow: {
    marginTop: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  brandName: {
    fontSize: Typography.h1,
    fontWeight: "800",
    color: Colors.text,
  },
  tagline: {
    marginTop: Spacing.sm,
    maxWidth: 290,
    textAlign: "center",
    color: Colors.textSecondary,
    fontSize: Typography.small,
    lineHeight: 21,
  },
  card: {
    padding: Spacing.lg,
  },
  title: {
    fontSize: Typography.h2,
    fontWeight: "800",
    color: Colors.text,
    textAlign: "right",
  },
  subtitle: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
    color: Colors.textSecondary,
    fontSize: Typography.small,
    textAlign: "right",
    lineHeight: 20,
  },
  field: {
    marginBottom: Spacing.sm,
  },
  fieldHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  fieldLabel: {
    color: Colors.text,
    fontSize: Typography.small,
    fontWeight: "700",
  },
  hintText: {
    marginTop: -Spacing.sm,
    marginBottom: Spacing.sm,
    color: Colors.danger,
    fontSize: Typography.tiny,
    textAlign: "right",
  },
  errorText: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    color: Colors.danger,
    textAlign: "center",
    fontSize: Typography.small,
    lineHeight: 20,
  },
  submitButton: {
    marginTop: Spacing.sm,
    minHeight: 54,
  },
  loginRow: {
    marginTop: Spacing.lg,
    flexDirection: "row-reverse",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  loginPrompt: {
    color: Colors.textSecondary,
    fontSize: Typography.small,
  },
  loginLink: {
    color: Colors.primaryDark,
    fontSize: Typography.small,
    fontWeight: "700",
  },
  footer: {
    marginTop: Spacing.xl,
    textAlign: "center",
    color: Colors.textSecondary,
    fontSize: Typography.tiny,
  },
});
