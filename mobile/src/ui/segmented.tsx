import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/ui/text";
import { minTarget, radius, space, useColors } from "@/ui/tokens";

type Option<T> = { value: T; label: string };

/** Single choice among 2–4 short options (DESIGN.md › B15). Wraps on large font scales. */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  options: Option<T>[];
  value: T | undefined;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const c = useColors();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.row}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled }}
            accessibilityLabel={o.label}
            disabled={disabled}
            onPress={() => { if (!selected) onChange(o.value); }}
            style={({ pressed }) => [
              styles.item,
              { borderColor: selected ? c.accent : c.control, backgroundColor: selected ? c.accent : "transparent" },
              pressed && { opacity: 0.7 },
            ]}>
            <AppText variant="label" style={{ textAlign: "center", color: selected ? c.onAccent : disabled ? c.ink2 : c.ink }}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  item: {
    minHeight: minTarget,
    minWidth: minTarget,
    maxWidth: "100%",
    flexShrink: 1,
    paddingVertical: space.s,
    paddingHorizontal: space.m,
    borderWidth: 1,
    borderRadius: radius.control,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
});
