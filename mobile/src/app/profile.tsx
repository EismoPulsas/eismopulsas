import { useState } from "react";
import { Pressable, StyleSheet, Switch, TextInput, View } from "react-native";

import type { FuelType, Preference } from "@/api/contract";
import { FUEL_LT, PREFERENCE_HINT_LT, PREFERENCE_LT } from "@/domain/labels";
import { parseDecimal } from "@/format/lt";
import { useAppState } from "@/state/app-state";
import { InlineMessage } from "@/ui/inline-message";
import { Screen } from "@/ui/screen";
import { Segmented } from "@/ui/segmented";
import { AppText } from "@/ui/text";
import { minTarget, radius, space, type as typeScale, useColors } from "@/ui/tokens";

const FUELS: FuelType[] = ["petrol", "diesel", "lpg", "hybrid", "electric"];
const PREFERENCES: Preference[] = ["balanced", "fastest", "cheapest", "greener"];

function SwitchRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const c = useColors();
  return (
    <View style={styles.switchRow}>
      <AppText variant="rowTitle" style={styles.flex}>
        {label}
      </AppText>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: c.accent, false: c.control }} />
    </View>
  );
}

/** Radio list with optional one-line descriptions (DESIGN.md › B9). */
function RadioList<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string; hint?: string }[]; value: T; onChange: (v: T) => void }) {
  const c = useColors();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={o.hint ? `${o.label}. ${o.hint}` : o.label}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => [styles.radio, { borderBottomColor: c.line }, pressed && { opacity: 0.6 }]}>
            <View style={[styles.dot, { borderColor: selected ? c.accent : c.control }]}>{selected ? <View style={[styles.dotInner, { backgroundColor: c.accent }]} /> : null}</View>
            <View style={styles.flex}>
              <AppText variant="rowTitle">{o.label}</AppText>
              {o.hint ? (
                <AppText variant="meta" color="muted">
                  {o.hint}
                </AppText>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// Minimal mobility profile. Saved on change, only on this phone.
export default function Profile() {
  const c = useColors();
  const { profile, updateProfile } = useAppState();
  const [consumptionText, setConsumptionText] = useState(String(profile.car.consumption).replace(".", ","));
  const [consumptionError, setConsumptionError] = useState<string | null>(null);
  const unit = profile.car.fuel === "electric" ? "kWh/100 km" : "l/100 km";

  function commitConsumption() {
    const n = parseDecimal(consumptionText);
    if (n === null || n < 1 || n > 40) {
      setConsumptionError(`Įveskite sąnaudas nuo 1 iki 40 ${unit}.`);
      return;
    }
    setConsumptionError(null);
    updateProfile({ ...profile, car: { ...profile.car, consumption: n } });
  }

  return (
    <Screen>
      <View style={styles.group}>
        <SwitchRow label="Turiu automobilį" value={profile.car.available} onChange={(available) => updateProfile({ ...profile, car: { ...profile.car, available } })} />
        {profile.car.available ? (
          <>
            <AppText variant="label" color="ink2">
              Kuro tipas
            </AppText>
            <RadioList<FuelType>
              label="Kuro tipas"
              options={FUELS.map((f) => ({ value: f, label: FUEL_LT[f] }))}
              value={profile.car.fuel}
              onChange={(fuel) => updateProfile({ ...profile, car: { ...profile.car, fuel } })}
            />
            <AppText variant="label" color="ink2">
              Sąnaudos ({unit})
            </AppText>
            <TextInput
              accessibilityLabel={`Sąnaudos, ${unit}`}
              value={consumptionText}
              onChangeText={setConsumptionText}
              onEndEditing={commitConsumption}
              onSubmitEditing={commitConsumption}
              keyboardType="decimal-pad"
              style={[typeScale.body, styles.input, { borderColor: c.control, color: c.ink, backgroundColor: c.surface }]}
            />
            {consumptionError ? <InlineMessage tone="warning" text={consumptionError} /> : null}
          </>
        ) : (
          <AppText variant="meta" color="muted">
            Be automobilio lyginsime tik viešąjį transportą.
          </AppText>
        )}
      </View>

      <SwitchRow label="Turiu periodinį viešojo transporto bilietą" value={profile.transitPass} onChange={(transitPass) => updateProfile({ ...profile, transitPass })} />

      <View style={styles.group}>
        <AppText variant="label" color="ink2">
          Kiek daugiausia norite eiti pėsčiomis?
        </AppText>
        <Segmented<number>
          label="Daugiausia pėsčiomis"
          options={[5, 10, 15, 20].map((v) => ({ value: v, label: `${v} min` }))}
          value={profile.maxWalkMin}
          onChange={(maxWalkMin) => updateProfile({ ...profile, maxWalkMin })}
        />
      </View>

      <View style={styles.group}>
        <AppText variant="label" color="ink2">
          Kas svarbiausia?
        </AppText>
        <RadioList<Preference>
          label="Kas svarbiausia"
          options={PREFERENCES.map((p) => ({ value: p, label: PREFERENCE_LT[p], hint: PREFERENCE_HINT_LT[p] }))}
          value={profile.preference}
          onChange={(preference) => updateProfile({ ...profile, preference })}
        />
      </View>

      <AppText variant="meta" color="muted">
        Profilis saugomas tik šiame telefone ir siunčiamas tik kartu su kelionės užklausa. Dviračio ir kitų būdų palyginimą pridėsime vėliau.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.s },
  flex: { flex: 1 },
  switchRow: { flexDirection: "row", alignItems: "center", minHeight: minTarget, gap: space.m },
  radio: { flexDirection: "row", alignItems: "center", gap: space.m, minHeight: minTarget, paddingVertical: space.s, borderBottomWidth: StyleSheet.hairlineWidth },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  dotInner: { width: 10, height: 10, borderRadius: 5 },
  input: { minHeight: minTarget, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: space.m },
});
