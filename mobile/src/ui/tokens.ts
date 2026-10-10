// Design tokens (DESIGN.md › B12–B14). Components take colours only from here —
// no hex literals elsewhere. Typography is the native system font (Roboto on Android).

import { StyleSheet, useColorScheme } from "react-native";

const light = {
  bg: "#F6F6F3",
  surface: "#FFFFFF",
  ink: "#15171C",
  ink2: "#3B404B",
  muted: "#5C6370",
  line: "#E2E3E6",
  control: "#858B97",
  accent: "#0A6B5D",
  onAccent: "#FFFFFF",
  modeTransit: "#1D5FC2",
  modeCar: "#4A505C",
  modeWalk: "#6A707C",
  warning: "#8A5A00",
  error: "#B3261E",
  skeleton: "#E8E8E4",
};
export type Palette = typeof light;

const dark: Palette = {
  bg: "#0E1014",
  surface: "#171A21",
  ink: "#EDEFF3",
  ink2: "#C6CBD4",
  muted: "#9AA1AD",
  line: "#2A2F3A",
  control: "#6E7583",
  accent: "#45D3BC",
  onAccent: "#0E1014",
  modeTransit: "#6EA2F2",
  modeCar: "#A9AFBA",
  modeWalk: "#9AA1AD",
  warning: "#E8B34A",
  error: "#FF8A80",
  skeleton: "#22262F",
};

export function useColors(): Palette {
  return useColorScheme() === "dark" ? dark : light;
}

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;
export const radius = { control: 8, sheet: 16 } as const;
export const minTarget = 48;

/** Sizes in sp; never disable font scaling. */
export const type = StyleSheet.create({
  title: { fontSize: 24, lineHeight: 30, fontWeight: "600" },
  numeric: { fontSize: 32, lineHeight: 38, fontWeight: "600", fontVariant: ["tabular-nums"] },
  section: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  body: { fontSize: 16, lineHeight: 24, fontWeight: "400" },
  rowTitle: { fontSize: 16, lineHeight: 22, fontWeight: "500" },
  cell: { fontSize: 16, lineHeight: 22, fontWeight: "400", fontVariant: ["tabular-nums"] },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "500" },
  meta: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
});
