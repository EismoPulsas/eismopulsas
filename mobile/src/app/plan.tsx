import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Keyboard, StyleSheet, TextInput, View } from "react-native";

import type { PlanResponse, Preference } from "@/api/contract";
import { BASIS_LT, PREFERENCE_LT, STRATEGY_LT } from "@/domain/labels";
import { formatClock, formatDuration, formatTimestamp } from "@/format/lt";
import { useAppState } from "@/state/app-state";
import { Button } from "@/ui/button";
import { InlineMessage } from "@/ui/inline-message";
import { OptionRow } from "@/ui/option-row";
import { Screen } from "@/ui/screen";
import { Segmented } from "@/ui/segmented";
import { AppText } from "@/ui/text";
import { minTarget, radius, space, type as typeScale, useColors } from "@/ui/tokens";

const PREFERENCES: Preference[] = ["balanced", "fastest", "cheapest", "greener"];

/** Assumptions, sources and warnings behind the numbers ("Kodėl?", DESIGN.md › B6). */
function WhyDetails({ response }: { response: PlanResponse }) {
  return (
    <View style={styles.group}>
      <AppText variant="label">Prielaidos</AppText>
      {response.assumptions.map((a) => (
        <AppText key={a.id} variant="meta" color="ink2">
          • {a.text}
        </AppText>
      ))}
      <AppText variant="label">Šaltiniai</AppText>
      {response.sources.map((s) => (
        <AppText key={s.id} variant="meta" color="ink2">
          • {s.name} ({BASIS_LT[s.basis]}){s.note ? ` – ${s.note}` : ""}
        </AppText>
      ))}
      {response.warnings.map((w) => (
        <InlineMessage key={w.code} tone="warning" text={w.text} />
      ))}
    </View>
  );
}

function Skeleton() {
  const c = useColors();
  return (
    <View style={styles.group} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      {[96, 72, 72].map((h, i) => (
        <View key={i} style={{ height: h, borderRadius: radius.control, backgroundColor: c.skeleton }} />
      ))}
    </View>
  );
}

// Comparison: the recommendation and its reason first, alternatives below (DESIGN.md › B4–B6).
export default function PlanScreen() {
  const router = useRouter();
  const c = useColors();
  const { plan, startPlan, retryPlan, cancelPlan, saveTrip, planTripId, trips } = useAppState();
  const [showWhy, setShowWhy] = useState(false);
  const [name, setName] = useState("Darbas");
  useFocusEffect(useCallback(() => () => cancelPlan(), [cancelPlan]));

  function save() {
    if (saveTrip(name)) Keyboard.dismiss();
  }

  if (plan.status === "idle") {
    return (
      <Screen>
        <InlineMessage text="Pirmiausia nurodykite kelionę." actionLabel="Atgal" onAction={() => router.dismissTo("/")} />
      </Screen>
    );
  }

  const preference = plan.request.profile?.preference ?? "balanced";
  const savedTrip = trips.find((t) => t.id === planTripId);
  const arriveBy = new Date(plan.request.arriveBy);
  const day = arriveBy.toDateString() === new Date().toDateString() ? "Šiandien" : "Rytoj";
  const context = `Į ${plan.request.destination.label ?? "tikslą"} · atvykti iki ${formatClock(plan.request.arriveBy)} · ${day}`;

  return (
    <Screen>
      <View style={styles.group}>
        <AppText color="ink2">{context}</AppText>
        <Button kind="text" label="Keisti kelionę" onPress={() => router.dismissTo("/")} />
      </View>

      <View style={styles.group}>
        <AppText variant="label" color="ink2">
          Kas svarbiausia šiai kelionei?
        </AppText>
        <Segmented<Preference>
          label="Prioritetas"
          options={PREFERENCES.map((p) => ({ value: p, label: PREFERENCE_LT[p] }))}
          value={preference}
          disabled={plan.status === "loading"}
          onChange={(p) => startPlan(p)}
        />
      </View>

      {plan.status === "loading" ? (
        <View style={styles.group}>
          <AppText color="ink2" accessibilityLiveRegion="polite">
            Lyginame variantus…
          </AppText>
          <Skeleton />
        </View>
      ) : null}

      {plan.status === "error" ? (
        <View style={styles.group}>
          <InlineMessage tone="error" text={plan.message}
            actionLabel={["no_base_url", "invalid_base_url", "http_401", "http_403"].includes(plan.code) ? undefined : "Bandyti dar kartą"}
            onAction={retryPlan} />
          {savedTrip?.last ? <AppText color="ink2">
            Paskutinė rekomendacija ({formatTimestamp(savedTrip.last.at)}): {savedTrip.last.title} · {formatDuration(savedTrip.last.durationMin)}. Tai ankstesnis rezultatas; dabartinės kelionės dar nepavyko palyginti.
          </AppText> : null}
        </View>
      ) : null}

      {plan.status === "ok" ? (
        <>
          {plan.response.dataMode !== "live" ? (
            <AppText variant="meta" color="muted">
              {plan.response.dataMode === "demo"
                ? "Demonstraciniai maršrutų duomenys: laikai ir persėdimai sugeneruoti, ne JUDU tvarkaraštis."
                : "Dalis maršrutų duomenų – demonstraciniai."}{" "}
              Kainos – pagal JUDU tarifus, CO₂ – apytiksliai.
            </AppText>
          ) : null}

          {plan.response.options.length === 0 ? (
            <InlineMessage tone="warning" text="Tinkamų variantų nerasta. Pabandykite kitą laiką arba vietą." />
          ) : null}

          {plan.response.recommendation?.state === "all_late" ? (
            <AppText variant="section" color="warning" accessibilityRole="header">
              Laiku atvykti nepavyks
            </AppText>
          ) : null}

          {plan.response.options.map((o) => (
            <View key={o.id}>
              {o.status !== "recommended" && o === plan.response.options.find((x) => x.status !== "recommended") ? (
                <AppText variant="section" accessibilityRole="header" style={styles.sectionGap}>
                  Kiti variantai
                </AppText>
              ) : null}
              <OptionRow option={o} recommended={o.status === "recommended"} onPress={() => router.push({ pathname: "/route/[id]", params: { id: o.id } })} />
            </View>
          ))}

          {plan.response.unavailable.map((u) => (
            <AppText key={`${u.strategy}-${u.code}`} variant="meta" color="muted">
              {STRATEGY_LT[u.strategy]} – {u.text}
            </AppText>
          ))}

          <View style={styles.group}>
            <Button kind="text" label={showWhy ? "Slėpti prielaidas" : "Kodėl? Prielaidos ir šaltiniai"} accessibilityState={{ expanded: showWhy }} onPress={() => setShowWhy((v) => !v)} />
            {showWhy ? <WhyDetails response={plan.response} /> : null}
          </View>

          <View style={styles.group}>
            {savedTrip ? (
              <AppText color="ink2" accessibilityLiveRegion="polite">
                Išsaugota kaip „{savedTrip.name}“ – rasite pradžios ekrane.
              </AppText>
            ) : (
              <>
                <AppText variant="label" color="ink2">
                  Išsaugoti kelionę kaip
                </AppText>
                <View style={styles.saveRow}>
                  <TextInput
                    accessibilityLabel="Kelionės pavadinimas"
                    value={name}
                    onChangeText={setName}
                    maxLength={40}
                    returnKeyType="done"
                    onSubmitEditing={save}
                    style={[typeScale.body, styles.input, { borderColor: c.control, color: c.ink, backgroundColor: c.surface }]}
                  />
                  <Button kind="secondary" label="Išsaugoti" disabled={!name.trim()} onPress={save} />
                </View>
              </>
            )}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.s },
  sectionGap: { marginTop: space.l, marginBottom: space.xs },
  saveRow: { flexDirection: "row", flexWrap: "wrap", gap: space.s, alignItems: "center" },
  input: { flexGrow: 1, flexShrink: 1, flexBasis: 180, minWidth: 0, minHeight: minTarget, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: space.m, paddingVertical: space.s },
});
