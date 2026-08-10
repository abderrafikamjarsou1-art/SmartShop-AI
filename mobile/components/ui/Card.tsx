import { ReactNode } from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { Colors, Radius, Shadows, Spacing } from "../../theme";

type CardProps = {
  children: ReactNode;
  style?: ViewStyle;
};

export default function Card({ children, style }: CardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    ...Shadows.card,
  },
});