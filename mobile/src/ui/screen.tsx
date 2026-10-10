import type { ReactNode } from "react";
import { useHeaderHeight } from "expo-router/react-navigation";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { space, useColors } from "@/ui/tokens";

/** Scrollable screen body with the standard 16 dp side padding. */
export function Screen({ children }: { children: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  return (
    <KeyboardAvoidingView
      style={styles.fill}
      enabled={Platform.OS !== "web"}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={headerHeight}>
      <ScrollView
        style={[styles.fill, { backgroundColor: c.bg }]}
        contentContainerStyle={[styles.content, {
          paddingLeft: insets.left + space.l,
          paddingRight: insets.right + space.l,
          paddingBottom: insets.bottom + space.xxl,
        }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.l, gap: space.xl, flexGrow: 1 },
});
