import { Pressable, StyleSheet, type PressableProps } from "react-native";

import { AppText } from "@/ui/text";
import { minTarget, radius, space, useColors } from "@/ui/tokens";

type Props = Omit<PressableProps, "children"> & {
  label: string;
  kind?: "primary" | "secondary" | "text";
  busy?: boolean;
};

/** Primary (one per screen), secondary (outline) or text button; ≥ 48 dp. */
export function Button({ label, kind = "primary", disabled, busy = false, accessibilityState, style, ...rest }: Props) {
  const c = useColors();
  const primary = kind === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ ...accessibilityState, disabled: !!disabled || busy, busy }}
      disabled={disabled || busy}
      style={(state) => [
        styles.base,
        primary && { backgroundColor: disabled || busy ? c.line : c.accent },
        kind === "secondary" && { borderWidth: 1, borderColor: c.control },
        kind === "text" && styles.text,
        state.pressed && { opacity: 0.7 },
        typeof style === "function" ? style(state) : style,
      ]}
      {...rest}>
      <AppText variant="label" style={{ textAlign: "center", color: primary ? (disabled || busy ? c.ink2 : c.onAccent) : disabled ? c.ink2 : kind === "text" ? c.accent : c.ink }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: minTarget,
    minWidth: minTarget,
    maxWidth: "100%",
    flexShrink: 1,
    paddingVertical: space.s,
    paddingHorizontal: space.l,
    borderRadius: radius.control,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { paddingHorizontal: space.s, alignSelf: "flex-start" },
});
