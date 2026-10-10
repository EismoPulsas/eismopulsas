import { useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline, type LatLng } from "react-native-maps";

import type { Leg } from "@/api/contract";
import { modeColor } from "@/ui/option-row";
import { radius, useColors } from "@/ui/tokens";

const toLatLng = ([lng, lat]: [number, number]): LatLng => ({ latitude: lat, longitude: lng });

/**
 * Supporting map for one option (DESIGN.md › B8): legs by mode colour and line style
 * (walking dotted), A / B / P markers, camera fitted to the route. Everything shown here
 * is also in the leg list, so the map is never the only source of information.
 * Android uses Google Maps: works in Expo Go; a standalone build needs an API key (README).
 */
export function RouteMap({ legs }: { legs: Leg[] }) {
  const c = useColors();
  const ref = useRef<MapView>(null);
  const lines = legs.filter((l) => l.geometry && l.geometry.coordinates.length > 1);
  const coords = lines.flatMap((l) => l.geometry!.coordinates.map(toLatLng));
  if (coords.length === 0) return null;

  const start = legs[0].from;
  const end = legs[legs.length - 1].to;
  const park = legs.find((l) => l.mode === "park" && l.from.label?.startsWith("P+R"));
  const lats = coords.map((p) => p.latitude);
  const lngs = coords.map((p) => p.longitude);
  const initialRegion = {
    latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
    longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    latitudeDelta: Math.max(0.01, (Math.max(...lats) - Math.min(...lats)) * 1.6),
    longitudeDelta: Math.max(0.01, (Math.max(...lngs) - Math.min(...lngs)) * 1.6),
  };

  return (
    <View style={styles.frame} accessible accessibilityLabel="Maršruto žemėlapis. Visos atkarpos išvardytos žemiau.">
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        toolbarEnabled={false}
        rotateEnabled={false}
        onMapReady={() => ref.current?.fitToCoordinates(coords, { edgePadding: { top: 48, right: 48, bottom: 48, left: 48 }, animated: false })}>
        {lines.map((l, i) => (
          <Polyline
            key={i}
            coordinates={l.geometry!.coordinates.map(toLatLng)}
            strokeColor={modeColor(l, c)}
            strokeWidth={l.mode === "walk" ? 3 : 5}
            lineDashPattern={l.mode === "walk" ? [4, 8] : undefined}
          />
        ))}
        <Marker coordinate={{ latitude: start.lat, longitude: start.lng }} title="A – pradžia" description={start.label} />
        {park ? <Marker coordinate={{ latitude: park.from.lat, longitude: park.from.lng }} title="P – „Statyk ir važiuok“" description={park.from.label} /> : null}
        <Marker coordinate={{ latitude: end.lat, longitude: end.lng }} title="B – tikslas" description={end.label} />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { height: 280, borderRadius: radius.control, overflow: "hidden" },
});
