import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import type { SavedTrip } from "@/domain/trip";
import { formatDuration } from "@/format/lt";
import { AppText } from "@/ui/text";
import { minTarget, space, useColors } from "@/ui/tokens";

/** A saved recurring trip ("Darbas"): one tap opens today's comparison. */
export function SavedTripRow({ trip, onPress, trailing }: { trip: SavedTrip; onPress: () => void; trailing?: ReactNode }) {
  const c = useColors();
  const route = `${trip.origin.label ?? "Pradžia"} → ${trip.destination.label ?? "Tikslas"}`;
  return (
    <View style={[styles.row, { borderBottomColor: c.line }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${trip.name}. ${route}. Atvykti iki ${trip.arriveByTime}. Palyginti šiandienos variantus`}
        onPress={onPress}
        style={({ pressed }) => [styles.main, pressed && { opacity: 0.6 }]}>
        <AppText variant="rowTitle">{trip.name}</AppText>
        <AppText variant="meta" color="ink2">
          {route} · atvykti iki {trip.arriveByTime}
        </AppText>
        {trip.last ? (
          <AppText variant="meta" color="muted">
            Paskutinė rekomendacija: {trip.last.title} · {formatDuration(trip.last.durationMin)}
          </AppText>
        ) : null}
      </Pressable>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  main: { flex: 1, minHeight: minTarget, paddingVertical: space.m, gap: 2 },
});
