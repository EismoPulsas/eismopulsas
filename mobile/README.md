# Eismo Pulsas — mobilioji programėlė (Expo)

Android-first programėlė, kuri palygina automobilį, viešąjį transportą ir „Statyk ir važiuok“ (P+R) ir rekomenduoja vieną variantą su paaiškinimu.

- **Paleidimas:** pagrindinis [README › Mobilioji programėlė](../README.md#mobilioji-programėlė-mobile--paleidimas). Trumpai:
  1. `cp .env.example .env` ir nurodykite `EXPO_PUBLIC_API_BASE_URL`;
  2. `npm install`;
  3. `npx expo start`.
- **Architektūra ir failai:** [STRUCTURE.md › Part B](../STRUCTURE.md).
- **Dizainas:** [DESIGN.md › Part B](../DESIGN.md).
- **API sutartis:** [ROUTING.md § 9](../ROUTING.md). Tipai importuojami iš `../lib/mobility/types.ts` (tik `export type`, [ADR-0003](../docs/adr/0003-mobile-project-isolation-and-contract-sharing.md)).
- **Patikrinimai:** `npx tsc --noEmit`, `npm run lint`, `npx expo-doctor` ([TESTING.md › Part B](../TESTING.md)).
- **Priklausomybės** pridedamos tik per `npx expo install <paketas>`. Į šakninį `package.json` jų nedėkite.
