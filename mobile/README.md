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

## Serverio adresas ir klaidos

`EXPO_PUBLIC_API_BASE_URL` turi būti HTTP(S) serverio pradinis adresas, be `/api`, prisijungimo duomenų, užklausos ar fragmento. Android emuliatoriui naudokite `http://10.0.2.2:3000`, telefonui – kompiuterio LAN adresą tame pačiame Wi-Fi tinkle, diegimui – HTTPS adresą. `localhost`, `127.x.x.x`, `0.0.0.0` ir `[::1]` telefone atmetami. Neteisinga konfigūracija rodoma pradžios ekrane; tinklo užklausa nesiunčiama.

Pakeitę adresą paleiskite Expo iš naujo ir visiškai perkraukite programėlę. Įdiegtą paketą reikia sukurti iš naujo. Apsaugotas Vercel Preview gali grąžinti 401/403 arba HTML; naudokite programėlei pasiekiamą diegimą (STRUCTURE.md › B4).

Užklausa, įskaitant atsakymo nuskaitymą, trunka daugiausia 15 s. Po tinklo klaidos „Bandyti dar kartą“ pakartoja tą pačią užklausą. Grįžus iš kraunamo palyginimo ji atšaukiama. Išsaugotai kelionei po klaidos rodoma ankstesnės rekomendacijos santrauka su data ir laiku; tai nėra naujas maršrutas. Telefono klaviatūrą, SafeArea, TalkBack ir didžiausią šriftą dar būtina patikrinti pagal TESTING.md › B5.
