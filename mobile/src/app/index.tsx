import DateTimePicker from "@react-native-community/datetimepicker";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { profileLine } from "@/domain/labels";
import type { Day } from "@/domain/trip";
import { clockOf } from "@/format/lt";
import { useAppState } from "@/state/app-state";
import { Button } from "@/ui/button";
import { PlaceField } from "@/ui/place-field";
import { SavedTripRow } from "@/ui/saved-trip-row";
import { Screen } from "@/ui/screen";
import { Segmented } from "@/ui/segmented";
import { AppText } from "@/ui/text";
import { minTarget, space } from "@/ui/tokens";

// Home: where from, where to, arrive by → compare (DESIGN.md › B3). Decision first; no map here.
export default function Home() {
  const router = useRouter();
  const { draft, updateDraft, startPlan, trips, openSavedTrip, profile } = useAppState();
  const [pickTime, setPickTime] = useState(false);
  const canCompare = !!draft.origin && !!draft.destination;

  const [h, m] = draft.arriveByTime.split(":").map(Number);
  const timeValue = new Date();
  timeValue.setHours(h, m, 0, 0);

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerLinks}>
              <Button kind="text" label="Išsaugotos" onPress={() => router.push("/saved")} />
              <Button kind="text" label="Profilis" onPress={() => router.push("/profile")} />
            </View>
          ),
        }}
      />
      <Screen>
        <AppText variant="title" accessibilityRole="header">
          Kaip man geriausia nuvykti?
        </AppText>

        <View style={styles.group}>
          <PlaceField label="Iš" value={draft.origin} onChange={(origin) => updateDraft({ origin })} />
          <Button
            kind="text"
            label="Sukeisti vietas"
            disabled={!draft.origin && !draft.destination}
            onPress={() => updateDraft({ origin: draft.destination, destination: draft.origin })}
          />
          <PlaceField label="Į" value={draft.destination} onChange={(destination) => updateDraft({ destination })} />
        </View>

        <View style={styles.group}>
          <AppText variant="label" color="ink2">
            Atvykti iki
          </AppText>
          <View style={styles.timeRow}>
            <Segmented<Day>
              label="Diena"
              options={[
                { value: "today", label: "Šiandien" },
                { value: "tomorrow", label: "Rytoj" },
              ]}
              value={draft.day}
              onChange={(day) => updateDraft({ day })}
            />
            <Button kind="secondary" label={draft.arriveByTime} accessibilityLabel={`Atvykimo laikas ${draft.arriveByTime}. Keisti`} onPress={() => setPickTime(true)} />
          </View>
          {pickTime ? (
            <DateTimePicker
              value={timeValue}
              mode="time"
              is24Hour
              onValueChange={(_, d) => {
                setPickTime(false);
                updateDraft({ arriveByTime: clockOf(d) });
              }}
              onDismiss={() => setPickTime(false)}
            />
          ) : null}
        </View>

        <View style={styles.group}>
          <AppText variant="label" color="ink2">
            Kiek laiko būsite? (stovėjimo kainai)
          </AppText>
          <Segmented<number>
            label="Kiek laiko būsite"
            options={[
              { value: 0, label: "Nenurodyta" },
              { value: 60, label: "1 val." },
              { value: 180, label: "3 val." },
              { value: 540, label: "9 val." },
            ]}
            value={draft.stayMinutes ?? 0}
            onChange={(v) => updateDraft({ stayMinutes: v || undefined })}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Profilis: ${profileLine(profile)}. Keisti`}
          onPress={() => router.push("/profile")}
          style={styles.profileLine}>
          <AppText variant="meta" color="ink2">
            Profilis: {profileLine(profile)} · <AppText variant="meta" color="accent">Keisti</AppText>
          </AppText>
        </Pressable>

        <Button
          label="Palyginti"
          disabled={!canCompare}
          onPress={() => {
            startPlan();
            router.push("/plan");
          }}
        />
        {!canCompare ? (
          <AppText variant="meta" color="muted">
            Nurodykite, iš kur ir į kur vykstate.
          </AppText>
        ) : null}

        <View style={styles.group}>
          <AppText variant="section" accessibilityRole="header">
            Išsaugotos kelionės
          </AppText>
          {trips.length === 0 ? (
            <AppText color="ink2">Išsaugokite dažną kelionę, pvz., į darbą – rekomendaciją matysite vienu paspaudimu.</AppText>
          ) : (
            trips.map((t) => (
              <SavedTripRow
                key={t.id}
                trip={t}
                onPress={() => {
                  openSavedTrip(t);
                  router.push("/plan");
                }}
              />
            ))
          )}
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.s },
  timeRow: { flexDirection: "row", flexWrap: "wrap", gap: space.s, alignItems: "center" },
  headerLinks: { flexDirection: "row" },
  profileLine: { minHeight: minTarget, justifyContent: "center" },
});
