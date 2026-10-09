import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";

import { AppStateProvider } from "@/state/app-state";
import { useColors } from "@/ui/tokens";

// Stack navigation with Home as root; no tab bar in v0.1 (DESIGN.md › B7).
export default function RootLayout() {
  const scheme = useColorScheme();
  const c = useColors();
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, background: c.bg, card: c.surface, text: c.ink, primary: c.accent, border: c.line } };

  return (
    <ThemeProvider value={theme}>
      <AppStateProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ contentStyle: { backgroundColor: c.bg }, headerBackButtonDisplayMode: "minimal" }}>
          <Stack.Screen name="index" options={{ title: "Eismo Pulsas" }} />
          <Stack.Screen name="plan" options={{ title: "Palyginimas" }} />
          <Stack.Screen name="route/[id]" options={{ title: "Maršrutas" }} />
          <Stack.Screen name="saved" options={{ title: "Išsaugotos kelionės" }} />
          <Stack.Screen name="profile" options={{ title: "Profilis" }} />
        </Stack>
      </AppStateProvider>
    </ThemeProvider>
  );
}
