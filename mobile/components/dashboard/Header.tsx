import { useEffect, useState } from "react";
import {
  Bell,
  ChevronDown,
  Search,
  Store,
} from "lucide-react-native";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";

import { getUnreadCount } from "@/services/notifications-service";

const COLORS = {
  text: "#101828",
  muted: "#667085",
  primary: "#5B5CE2",
  primarySoft: "#EEF0FF",
  surface: "#FFFFFF",
  border: "#E7EAF0",
  badge: "#EF4444",
};

export default function Header() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getUnreadCount()
      .then((count) => {
        if (!cancelled) setUnreadCount(count);
      })
      .catch(() => {
        // best-effort — the badge just stays at 0 if this fails
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="فتح الإشعارات"
            onPress={() => router.push("/notifications")}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.pressed,
            ]}
          >
            <Bell
              size={21}
              strokeWidth={2.2}
              color={COLORS.text}
            />

            {unreadCount > 0 ? (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
              </View>
            ) : null}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="البحث"
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.pressed,
            ]}
          >
            <Search
              size={21}
              strokeWidth={2.2}
              color={COLORS.text}
            />
          </Pressable>
        </View>

        <View style={styles.profile}>
          <View style={styles.profileText}>
            <Text style={styles.greeting}>مساء الخير</Text>

            <View style={styles.userRow}>
              <ChevronDown
                size={15}
                strokeWidth={2.2}
                color={COLORS.muted}
              />

              <Text
                numberOfLines={1}
                style={styles.userName}
              >
                مدير المتجر
              </Text>
            </View>
          </View>

          <View style={styles.avatar}>
            <Store
              size={21}
              strokeWidth={2.2}
              color={COLORS.primary}
            />
          </View>
        </View>
      </View>

      <View style={styles.storeCard}>
        <View style={styles.storeContent}>
          <View style={styles.storeIcon}>
            <Store
              size={18}
              strokeWidth={2.2}
              color={COLORS.primary}
            />
          </View>

          <View style={styles.storeText}>
            <Text style={styles.storeLabel}>
              النشاط الحالي
            </Text>

            <Text
              numberOfLines={1}
              style={styles.storeName}
            >
              SmartShop AI
            </Text>
          </View>
        </View>

        <View style={styles.statusBadge}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>متصل</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
  },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#101828",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },

  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.97 }],
  },

  notificationBadge: {
    position: "absolute",
    top: 5,
    right: 5,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.badge,
    borderWidth: 2,
    borderColor: COLORS.surface,
  },

  notificationText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "800",
  },

  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    flex: 1,
    justifyContent: "flex-end",
  },

  profileText: {
    flexShrink: 1,
    alignItems: "flex-end",
  },

  greeting: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "right",
  },

  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },

  userName: {
    color: COLORS.text,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "800",
    textAlign: "right",
    maxWidth: 150,
  },

  avatar: {
    width: 46,
    height: 46,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primarySoft,
  },

  storeCard: {
    minHeight: 62,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 19,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  storeContent: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },

  storeIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primarySoft,
  },

  storeText: {
    flex: 1,
    alignItems: "flex-end",
  },

  storeLabel: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "600",
    textAlign: "right",
  },

  storeName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "right",
    marginTop: 2,
  },

  statusBadge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#ECFDF3",
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#12B76A",
  },

  statusText: {
    color: "#027A48",
    fontSize: 10,
    fontWeight: "800",
  },
});