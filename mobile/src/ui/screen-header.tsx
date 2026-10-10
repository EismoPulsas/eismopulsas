import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/ui/button";
import { AppText } from "@/ui/text";
import { minTarget, space, useColors } from "@/ui/tokens";

/** Same stack header, with a measured height so large text and actions can wrap. */
export function ScreenHeader({ title, onBack, actions }: { title: string; onBack?: () => void; actions?: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.line,
      paddingTop: insets.top, paddingLeft: insets.left + space.s, paddingRight: insets.right + space.s }]}>
      <View style={styles.row}>
        {onBack ? <Button kind="text" label="←" accessibilityLabel="Atgal" onPress={onBack} /> : null}
        <AppText variant="section" accessibilityRole="header" style={styles.title}>{title}</AppText>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { borderBottomWidth: StyleSheet.hairlineWidth },
  row: { minHeight: minTarget, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space.s, paddingVertical: space.s },
  title: { flexGrow: 1, flexShrink: 1, flexBasis: 120, minWidth: 0 },
  actions: { flexShrink: 1, maxWidth: "100%" },
});
