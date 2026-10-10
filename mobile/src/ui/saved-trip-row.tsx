import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import type { SavedTrip } from "@/domain/trip";
import { formatDuration, formatTimestamp } from "@/format/lt";
import { AppText } from "@/ui/text";
import { minTarget, space, useColors } from "@/ui/tokens";

/** A saved recurring trip ("Darbas"): one tap opens today's comparison. */
export function SavedTripRow({ trip, onPress, trailing, disabled = false }: { trip: SavedTrip; onPress: () => void; trailing?: ReactNode; disabled?: boolean }) {
  const c = useColors();
  const route = `${trip.origin.label ?? "Pradžia"} → ${trip.destination.label ?? "Tikslas"}`;
  return (
    <View style={[styles.row, { borderBottomColor: c.line }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${trip.name}. ${route}. Atvykti iki ${trip.arriveByTime}.${trip.last ? ` Paskutinė rekomendacija (${formatTimestamp(trip.last.at)}): ${trip.last.title}, ${formatDuration(trip.last.durationMin)}.` : ""} Palyginti variantus`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.main, pressed && { opacity: 0.6 }]}>
        <AppText variant="rowTitle">{trip.name}</AppText>
        <AppText variant="meta" color="ink2">
          {route} · atvykti iki {trip.arriveByTime}
        </AppText>
        {trip.last ? (
          <AppText variant="meta" color="muted">
            Paskutinė rekomendacija ({formatTimestamp(trip.last.at)}): {trip.last.title} · {formatDuration(trip.last.durationMin)}
          </AppText>
        ) : null}
      </Pressable>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  main: { flexGrow: 1, flexShrink: 1, flexBasis: 180, minWidth: minTarget, minHeight: minTarget, paddingVertical: space.m, gap: space.xs },
});
