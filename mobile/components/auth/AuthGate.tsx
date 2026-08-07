import { ReactNode, useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect, useSegments } from "expo-router";

import { useAuthStore } from "../../store/auth-store";
import { Colors } from "../../theme";

type AuthGateProps = {
  children: ReactNode;
};

export default function AuthGate({ children }: AuthGateProps) {
  const segments = useSegments();

  const isLoading = useAuthStore((state) => state.isLoading);
  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );
  const restoreSession = useAuthStore(
    (state) => state.restoreSession
  );

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const isInsideAuth = segments[0] === "(auth)";

  if (!isAuthenticated && !isInsideAuth) {
    return <Redirect href="/(auth)/login" />;
  }

  if (isAuthenticated && isInsideAuth) {
    return <Redirect href="/(tabs)" />;
  }

  return children;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },
});