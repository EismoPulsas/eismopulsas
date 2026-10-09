import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { ApiError, geocode, type GeocodeResult } from "@/api/client";
import type { Place } from "@/api/contract";
import { Button } from "@/ui/button";
import { InlineMessage } from "@/ui/inline-message";
import { AppText } from "@/ui/text";
import { minTarget, radius, space, type as typeScale, useColors } from "@/ui/tokens";

/** "9, Gedimino pr., Senamiestis, …" → "Gedimino pr. 9". */
function shortLabel(r: GeocodeResult): string {
  const parts = r.label.split(", ");
  const i = r.street ? parts.indexOf(r.street) : -1;
  if (i < 0) return parts[0];
  const house = i > 0 && /^\d/.test(parts[i - 1]) ? ` ${parts[i - 1]}` : "";
  const poi = i > 1 ? `${parts[0]}, ` : "";
  return `${poi}${r.street}${house}`;
}

/**
 * Address search on submit (the public Nominatim server forbids autocomplete; DESIGN.md › B4).
 * Shows the chosen place with a "Keisti" action once picked.
 */
export function PlaceField({ label, value, onChange }: { label: string; value: Place | null; onChange: (p: Place | null) => void }) {
  const c = useColors();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    const q = query.trim();
    if (q.length < 3) {
      setError("Įveskite bent 3 simbolius.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await geocode(q.includes(",") ? q : `${q}, Vilnius`);
      setResults(r);
      if (r.length === 0) setError("Adreso nerasta. Patikrinkite rašybą arba nurodykite miestą.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Adreso paieška nepavyko.");
    } finally {
      setBusy(false);
    }
  }

  if (value) {
    return (
      <View style={styles.block}>
        <AppText variant="label" color="ink2">
          {label}
        </AppText>
        <View style={[styles.chosen, { borderColor: c.control }]}>
          <AppText variant="rowTitle" style={styles.flex}>
            {value.label ?? `${value.lat.toFixed(4)}, ${value.lng.toFixed(4)}`}
          </AppText>
          <Button
            kind="text"
            label="Keisti"
            accessibilityLabel={`Keisti: ${label}`}
            onPress={() => {
              setQuery(value.label ?? "");
              setResults(null);
              onChange(null);
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <AppText variant="label" color="ink2" nativeID={`label-${label}`}>
        {label}
      </AppText>
      <View style={styles.inputRow}>
        <TextInput
          accessibilityLabel={label}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          placeholder="Gatvė ir numeris, pvz. Gedimino pr. 9"
          placeholderTextColor={c.muted}
          returnKeyType="search"
          autoCorrect={false}
          style={[typeScale.body, styles.input, { borderColor: c.control, color: c.ink, backgroundColor: c.surface }]}
        />
        <Button kind="secondary" label={busy ? "Ieškoma…" : "Ieškoti"} disabled={busy} onPress={search} />
      </View>
      {error ? <InlineMessage tone="warning" text={error} /> : null}
      {results?.slice(0, 5).map((r) => {
        const short = shortLabel(r);
        return (
          <Pressable
            key={`${r.lat},${r.lng},${r.label}`}
            accessibilityRole="button"
            accessibilityLabel={`${short}, ${r.city ?? ""}`}
            onPress={() => {
              onChange({ lat: r.lat, lng: r.lng, label: short });
              setResults(null);
            }}
            style={({ pressed }) => [styles.result, { borderBottomColor: c.line }, pressed && { opacity: 0.6 }]}>
            <AppText variant="rowTitle">{short}</AppText>
            <AppText variant="meta" color="muted" numberOfLines={1}>
              {r.city ?? r.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.s },
  flex: { flex: 1 },
  inputRow: { flexDirection: "row", gap: space.s, alignItems: "center" },
  input: { flex: 1, minHeight: minTarget, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: space.m },
  chosen: { flexDirection: "row", alignItems: "center", gap: space.s, borderWidth: 1, borderRadius: radius.control, paddingLeft: space.m, minHeight: minTarget },
  result: { minHeight: minTarget, paddingVertical: space.s, borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: "center" },
});
