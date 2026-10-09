import { Pressable, StyleSheet, View } from "react-native";

import type { Leg, RouteOption } from "@/api/contract";
import { formatClock, formatDuration, formatEur, formatKg } from "@/format/lt";
import { AppText } from "@/ui/text";
import { minTarget, space, useColors, type Palette } from "@/ui/tokens";

export function legLabel(l: Leg): string {
  const line = l.line?.name ? ` ${l.line.name}` : "";
  switch (l.mode) {
    case "car":
      return "Automobilis";
    case "park":
      return l.from.label?.startsWith("P+R") ? "P+R" : "Parkavimas";
    case "walk":
      return `Pėsčiomis ${l.durationMin} min`;
    case "bus":
      return `Autobusas${line}`;
    case "trolleybus":
      return `Troleibusas${line}`;
    default:
      return `Viešasis transportas${line}`;
  }
}

export function modeColor(l: Leg, c: Palette): string {
  if (l.mode === "car" || l.mode === "park") return c.modeCar;
  if (l.mode === "walk") return c.modeWalk;
  return c.modeTransit;
}

/** Mode sequence as text; very short walks are left out of the strip (they stay in the detail). */
export function LegStrip({ legs }: { legs: Leg[] }) {
  const c = useColors();
  const shown = legs.filter((l) => !(l.mode === "walk" && l.durationMin < 3));
  return (
    <View style={styles.strip} accessible accessibilityLabel={shown.map(legLabel).join(", tada ")}>
      {shown.map((l, i) => (
        <AppText key={i} variant="meta" style={{ color: modeColor(l, c) }}>
          {i > 0 ? "→ " : ""}
          {legLabel(l)}
        </AppText>
      ))}
    </View>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.metric}>
      <AppText variant="meta" color="muted">
        {label}
      </AppText>
      <AppText variant="cell" style={strong ? styles.strong : undefined}>
        {value}
      </AppText>
    </View>
  );
}

/** One option. The recommended variant adds the label, the accent rule, the large time and the reason sentence. */
export function OptionRow({ option, recommended, onPress }: { option: RouteOption; recommended?: boolean; onPress: () => void }) {
  const c = useColors();
  const m = option.metrics;
  const late = option.feasibility.lateMin > 0;
  const time = formatDuration(m.durationMin);
  const cost = formatEur(m.costEur, option.basis.cost);
  const co2 = formatKg(m.co2Kg, option.basis.co2);
  const a11y = `${recommended ? "Rekomenduojama. " : ""}${option.title}. ${time}, ${cost.replace("~", "apie ")}, CO₂ ${co2.replace("~", "apie ")}. Išvykite ${formatClock(option.departAt)}. ${option.summary}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityHint="Atidaro maršruto detales ir žemėlapį"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: c.line },
        recommended && [styles.recommended, { borderLeftColor: c.accent }],
        pressed && { opacity: 0.7 },
      ]}>
      {recommended ? (
        <AppText variant="label" color="accent">
          Rekomenduojama
        </AppText>
      ) : null}
      <AppText variant={recommended ? "section" : "rowTitle"}>{option.title}</AppText>
      <LegStrip legs={option.legs} />
      {recommended ? (
        <View style={styles.headline}>
          <AppText variant="numeric">{time}</AppText>
          <AppText color="ink2">Išvykite {formatClock(option.departAt)}</AppText>
        </View>
      ) : null}
      <View style={styles.metrics}>
        {!recommended ? <Metric label="Laikas" value={late ? `${time} (vėluosite ${option.feasibility.lateMin} min)` : time} /> : null}
        <Metric label="Kaina" value={cost} />
        <Metric label="CO₂" value={co2} />
      </View>
      <AppText variant={recommended ? "body" : "meta"} color={recommended ? "ink" : "ink2"}>
        {option.summary}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space.m, gap: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: minTarget },
  recommended: { borderLeftWidth: 3, paddingLeft: space.m, borderBottomWidth: 0, paddingBottom: space.l },
  strip: { flexDirection: "row", flexWrap: "wrap", columnGap: space.xs },
  headline: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: space.m },
  metrics: { flexDirection: "row", flexWrap: "wrap", columnGap: space.xl, rowGap: space.xs },
  metric: { minWidth: 80 },
  strong: { fontWeight: "600" },
});
