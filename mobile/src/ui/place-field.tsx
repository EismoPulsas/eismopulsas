import { useEffect, useRef, useState } from "react";
import { Keyboard, Pressable, StyleSheet, TextInput, View } from "react-native";

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
  const [retry, setRetry] = useState(false);
  const active = useRef<AbortController | null>(null);

  useEffect(() => () => {
    active.current?.abort();
    active.current = null;
  }, [value]);

  function editQuery(text: string) {
    active.current?.abort();
    active.current = null;
    setBusy(false);
    setQuery(text);
    setResults(null);
    setError(null);
    setRetry(false);
  }

  async function search() {
    if (active.current) return;
    const q = query.trim();
    if (q.length < 3) {
      setError("Įveskite bent 3 simbolius.");
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    Keyboard.dismiss();
    setBusy(true);
    setError(null);
    setRetry(false);
    setResults(null);
    try {
      const r = await geocode(q.includes(",") ? q : `${q}, Vilnius`, controller.signal);
      if (active.current !== controller || controller.signal.aborted) return;
      setResults(r);
      if (r.length === 0) setError("Adreso nerasta. Patikrinkite rašybą arba nurodykite miestą.");
    } catch (e) {
      if (active.current !== controller || controller.signal.aborted) return;
      setError(e instanceof ApiError ? e.message : "Adreso paieška nepavyko.");
      setRetry(!(e instanceof ApiError) || !["no_base_url", "invalid_base_url", "http_401", "http_403"].includes(e.code));
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
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
              setError(null);
              setRetry(false);
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
          onChangeText={editQuery}
          onSubmitEditing={search}
          placeholder="Gatvė ir numeris, pvz. Gedimino pr. 9"
          placeholderTextColor={c.muted}
          returnKeyType="search"
          accessibilityHint="Įveskite adresą ir paspauskite Ieškoti."
          maxLength={190}
          autoCorrect={false}
          style={[typeScale.body, styles.input, { borderColor: c.control, color: c.ink, backgroundColor: c.surface }]}
        />
        <Button kind="secondary" label={busy ? "Ieškoma…" : "Ieškoti"} accessibilityLabel={`Ieškoti adreso: ${label}`} busy={busy} onPress={search} />
      </View>
      {query && !busy ? <Button kind="text" label="Išvalyti" accessibilityLabel={`Išvalyti adresą: ${label}`} onPress={() => editQuery("")} /> : null}
      {busy ? <AppText variant="meta" color="ink2" accessibilityLiveRegion="polite">Ieškoma adresų…</AppText> : null}
      {error ? <InlineMessage tone="warning" text={error} actionLabel={retry ? "Bandyti dar kartą" : undefined} onAction={search} /> : null}
      {results?.length ? <AppText variant="meta" color="muted" accessibilityLiveRegion="polite">Rasta adresų: {results.length}. Pasirinkite vietą.</AppText> : null}
      {results?.slice(0, 5).map((r) => {
        const short = shortLabel(r);
        return (
          <Pressable
            key={`${r.lat},${r.lng},${r.label}`}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${r.label}`}
            onPress={() => {
              onChange({ lat: r.lat, lng: r.lng, label: short });
              Keyboard.dismiss();
              setResults(null);
            }}
            style={({ pressed }) => [styles.result, { borderBottomColor: c.line }, pressed && { opacity: 0.6 }]}>
            <AppText variant="rowTitle">{short}</AppText>
            <AppText variant="meta" color="muted">
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
  flex: { flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 0 },
  inputRow: { flexDirection: "row", flexWrap: "wrap", gap: space.s, alignItems: "center" },
  input: { flexGrow: 1, flexShrink: 1, flexBasis: 180, minWidth: 0, minHeight: minTarget, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: space.m, paddingVertical: space.s },
  chosen: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.s, borderWidth: 1, borderRadius: radius.control, padding: space.s, minHeight: minTarget },
  result: { minHeight: minTarget, paddingVertical: space.s, borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: "center" },
});
