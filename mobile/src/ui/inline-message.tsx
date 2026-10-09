import { StyleSheet, View } from "react-native";

import { Button } from "@/ui/button";
import { AppText } from "@/ui/text";
import { space, useColors } from "@/ui/tokens";

/** Info / warning / error next to its cause, with an optional action. Text, not colour alone. */
export function InlineMessage({
  tone = "info",
  text,
  actionLabel,
  onAction,
}: {
  tone?: "info" | "warning" | "error";
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const c = useColors();
  const color = tone === "error" ? c.error : tone === "warning" ? c.warning : c.ink2;
  const prefix = tone === "error" ? "Klaida: " : tone === "warning" ? "Dėmesio: " : "";
  return (
    <View accessibilityLiveRegion="polite" style={[styles.box, { borderLeftColor: color }]}>
      <AppText style={{ color }}>
        {prefix}
        {text}
      </AppText>
      {actionLabel && onAction ? <Button kind="secondary" label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderLeftWidth: 3, paddingLeft: space.m, paddingVertical: space.s, gap: space.s },
});
