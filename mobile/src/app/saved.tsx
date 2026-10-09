import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import type { SavedTrip } from "@/domain/trip";
import { useAppState } from "@/state/app-state";
import { Button } from "@/ui/button";
import { InlineMessage } from "@/ui/inline-message";
import { SavedTripRow } from "@/ui/saved-trip-row";
import { Screen } from "@/ui/screen";
import { AppText } from "@/ui/text";
import { space } from "@/ui/tokens";

// Saved recurring trips ("Darbas"). Deleting offers undo instead of a dialog (DESIGN.md › B10).
export default function SavedTrips() {
  const router = useRouter();
  const { trips, openSavedTrip, deleteTrip, restoreTrip } = useAppState();
  const [deleted, setDeleted] = useState<SavedTrip | null>(null);

  return (
    <Screen>
      {deleted ? (
        <InlineMessage
          text={`Ištrinta „${deleted.name}“.`}
          actionLabel="Atšaukti"
          onAction={() => {
            restoreTrip(deleted);
            setDeleted(null);
          }}
        />
      ) : null}

      {trips.length === 0 ? (
        <View style={styles.group}>
          <AppText color="ink2">Išsaugotų kelionių dar nėra.</AppText>
          <AppText color="ink2">Palyginkite kelionę ir rezultatų apačioje paspauskite „Išsaugoti“, pvz., pavadinę ją „Darbas“.</AppText>
          <Button kind="secondary" label="Nauja kelionė" onPress={() => router.replace("/")} />
        </View>
      ) : (
        <View>
          {trips.map((t) => (
            <SavedTripRow
              key={t.id}
              trip={t}
              onPress={() => {
                openSavedTrip(t);
                router.push("/plan");
              }}
              trailing={<Button kind="text" label="Ištrinti" accessibilityLabel={`Ištrinti „${t.name}“`} onPress={() => setDeleted(deleteTrip(t.id) ?? null)} />}
            />
          ))}
        </View>
      )}

      <AppText variant="meta" color="muted">
        Išsaugotos kelionės saugomos tik šiame telefone.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.m },
});
