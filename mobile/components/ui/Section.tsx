import { View, Text, StyleSheet } from "react-native";
import { Colors, Spacing, Typography } from "../../theme";

type Props = {
  title: string;
  children: React.ReactNode;
};

export default function Section({ title, children }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  title: {
    fontSize: Typography.h3,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: Spacing.md,
  },
});