import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";

import { AppStateProvider } from "@/state/app-state";
import { ScreenHeader } from "@/ui/screen-header";
import { useColors } from "@/ui/tokens";

// Keep Home beneath a deep link, so back/edit never returns to an empty stack.
export const unstable_settings = { anchor: "index" };

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
        <Stack screenOptions={{
          contentStyle: { backgroundColor: c.bg },
          headerBackButtonDisplayMode: "minimal",
          header: ({ back, navigation, options }) => (
            <ScreenHeader
              title={options.title ?? "Eismo Pulsas"}
              onBack={back ? () => navigation.goBack() : undefined}
              actions={options.headerRight?.({ canGoBack: !!back, tintColor: c.accent })}
            />
          ),
        }}>
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
