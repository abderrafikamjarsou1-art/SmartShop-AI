import { useAuthStore } from "@/store/auth-store";
import { getAuthErrorMessage, loginRequest } from "@/services/auth-service";
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
import { Link, router, useLocalSearchParams } from "expo-router";
import { LockKeyhole, Mail, Store, Sparkles } from "lucide-react-native";

import { Button, Card, Input } from "../../components/ui";
import { Colors, Radius, Shadows, Spacing, Typography } from "../../theme";

export default function LoginScreen() {
  const params = useLocalSearchParams<{ verifyEmail?: string }>();

  const [email, setEmail] = useState(params.verifyEmail ?? "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const login = useAuthStore((state) => state.login);

  async function handleLogin() {
    if (loading) return; // prevent double-tap re-entry

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password.trim()) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);

      const result = await loginRequest({
        email: normalizedEmail,
        password,
      });

      await login(result.user, result.token);

      router.replace("/(tabs)");
    } catch (error) {
      setErrorMessage(
        getAuthErrorMessage(error, "تعذر تسجيل الدخول. تحقق من بياناتك وحاول مجددًا.")
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

            <Text style={styles.tagline}>
              إدارة متجرك، مبيعاتك ومخزونك بذكاء.
            </Text>
          </View>

          <Card style={styles.card}>
            <Text style={styles.title}>مرحبًا بعودتك</Text>
            <Text style={styles.subtitle}>
              سجل الدخول للوصول إلى لوحة تحكم متجرك.
            </Text>

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
            </View>

            <Link href="/(auth)/forgot-password" asChild>
              <Pressable style={styles.forgotButton}>
                <Text style={styles.forgotText}>نسيت كلمة المرور؟</Text>
              </Pressable>
            </Link>

            {errorMessage ? (
              <Text style={styles.errorText}>{errorMessage}</Text>
            ) : null}

            <Button
              title="تسجيل الدخول"
              loading={loading}
              disabled={!email.trim() || !password.trim()}
              onPress={handleLogin}
              style={styles.loginButton}
            />

            <View style={styles.registerRow}>
              <Text style={styles.registerPrompt}>ليس لديك حساب؟</Text>
              <Link href="/(auth)/register" asChild>
                <Pressable>
                  <Text style={styles.registerLink}>إنشاء حساب جديد</Text>
                </Pressable>
              </Link>
            </View>
          </Card>

          <Text style={styles.footer}>
            © {new Date().getFullYear()} SmartShop AI
          </Text>
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
  forgotButton: {
    alignSelf: "flex-end",
    marginBottom: Spacing.lg,
  },
  forgotText: {
    color: Colors.primaryDark,
    fontSize: Typography.small,
    fontWeight: "700",
  },
  loginButton: {
    minHeight: 54,
  },
  errorText: {
    marginBottom: Spacing.md,
    color: Colors.danger,
    textAlign: "center",
    fontSize: Typography.small,
    lineHeight: 20,
  },
  registerRow: {
    marginTop: Spacing.lg,
    flexDirection: "row-reverse",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  registerPrompt: {
    color: Colors.textSecondary,
    fontSize: Typography.small,
  },
  registerLink: {
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