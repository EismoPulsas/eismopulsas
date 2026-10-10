import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { BASIS_LT } from "@/domain/labels";
import { formatClock, formatDuration, formatEur, formatKg } from "@/format/lt";
import { useAppState } from "@/state/app-state";
import { InlineMessage } from "@/ui/inline-message";
import { legLabel, modeColor } from "@/ui/option-row";
import { RouteMap } from "@/ui/route-map";
import { Screen } from "@/ui/screen";
import { AppText } from "@/ui/text";
import { space, useColors } from "@/ui/tokens";

// Option detail: what exactly to do and when, the reason, the costs, and the map (DESIGN.md › B4, B8).
export default function RouteDetail() {
  const router = useRouter();
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { plan } = useAppState();
  const option = plan.status === "ok" ? plan.response.options.find((o) => o.id === id) : undefined;

  if (!option) {
    return (
      <Screen>
        <InlineMessage text="Maršrutas nerastas – palyginkite kelionę iš naujo." actionLabel="Atgal" onAction={() => router.canGoBack() ? router.back() : router.replace("/")} />
      </Screen>
    );
  }

  const m = option.metrics;
  const demo = option.legs.some((l) => l.basis === "demo");

  return (
    <>
      <Stack.Screen options={{ title: "Maršrutas" }} />
      <Screen>
        <View style={styles.group}>
          <AppText variant="section" accessibilityRole="header">{option.title}</AppText>
          {option.status === "recommended" ? (
            <AppText variant="label" color="accent">
              Rekomenduojama
            </AppText>
          ) : null}
          <AppText variant="numeric">{formatDuration(m.durationMin)}</AppText>
          <AppText color="ink2">
            Išvykite {formatClock(option.departAt)} · Atvyksite {formatClock(option.arriveAt)}
            {option.feasibility.lateMin > 0 ? ` · vėluosite ${option.feasibility.lateMin} min` : ""}
          </AppText>
          <AppText>
            {formatEur(m.costEur, option.basis.cost)} · CO₂ {formatKg(m.co2Kg, option.basis.co2)} · pėsčiomis {m.walkMin} min
            {m.transfers ? ` · persėdimų: ${m.transfers}` : ""}
          </AppText>
          <AppText color="ink2">{option.summary}</AppText>
        </View>

        <RouteMap legs={option.legs} />

        <View style={styles.group}>
          <AppText variant="section" accessibilityRole="header">
            Atkarpos
          </AppText>
          {option.legs.map((l, i) => (
            <View key={i} style={[styles.leg, { borderBottomColor: c.line }]} accessible>
              <AppText variant="cell" style={styles.time}>
                {formatClock(l.departAt)}
              </AppText>
              <View style={styles.flex}>
                <AppText variant="rowTitle" style={{ color: modeColor(l, c) }}>
                  {legLabel(l)}
                </AppText>
                <AppText color="ink2">{l.note}</AppText>
                <AppText variant="meta" color="muted">
                  {l.durationMin} min{l.distanceKm ? ` · ${String(l.distanceKm).replace(".", ",")} km` : ""}
                  {l.to.label && l.mode !== "park" ? ` · iki: ${l.to.label}` : ""}
                </AppText>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.group}>
          <AppText variant="section" accessibilityRole="header">
            Kaina
          </AppText>
          {option.cost.map((item, i) => (
            <View key={i} style={styles.costRow}>
              <AppText color="ink2" style={styles.flex}>
                {item.label}
              </AppText>
              <AppText variant="cell">{formatEur(item.eur, item.basis)}</AppText>
            </View>
          ))}
        </View>

        <AppText variant="meta" color="muted">
          {demo
            ? "Laikai ir maršruto geometrija – demonstraciniai (sintetiniai), ne JUDU tvarkaraštis."
            : `Laikų šaltinis: ${BASIS_LT[option.basis.duration]} duomenys.`}{" "}
          „~“ – apytikslė reikšmė.
        </AppText>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.s },
  flex: { flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 0 },
  leg: { flexDirection: "row", flexWrap: "wrap", gap: space.m, paddingVertical: space.s, borderBottomWidth: StyleSheet.hairlineWidth },
  time: { minWidth: 52, flexShrink: 1 },
  costRow: { flexDirection: "row", flexWrap: "wrap", gap: space.m, alignItems: "baseline" },
});
