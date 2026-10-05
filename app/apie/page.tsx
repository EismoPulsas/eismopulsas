import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = { title: "Apie / API" };

const ENDPOINTS = [
  {
    method: "GET",
    path: "/api/accidents?year=2025&muni=13&category=bike&severity=fatal,injury",
    text: "Oficialūs eismo įvykiai GeoJSON formatu. Parametrai: year (2021–2025), muni (savivaldybės LAU kodas, pvz. 13 – Vilniaus m.), category (all, bike, pedestrian, scooter, moto, drunk, child), severity, limit (≤ 20 000).",
  },
  { method: "GET", path: "/api/reports", text: "Visi vartotojų pažymėti pavojai su balsų skaičiumi." },
  {
    method: "POST",
    path: "/api/reports",
    text: "Naujas pavojus { lat, lng, category, note? } su antrašte x-voter-id. Jei per 35 m yra tos pačios kategorijos žyma – užskaitomas balsas.",
  },
  { method: "POST", path: "/api/reports/:id/vote", text: "„Aš irgi“ – vienas balsas vienam x-voter-id." },
  { method: "GET", path: "/api/blackspots", text: "Policijos EĮIS „juodosios dėmės“ valstybiniuose keliuose (gyvai iš maps.ird.lt)." },
  { method: "GET", path: "/api/geocode?q=… arba ?lat=…&lng=…", text: "Adresų paieška per OpenStreetMap Nominatim (tik Lietuva)." },
  { method: "GET", path: "/data/stats.json", text: "Visa suvestinė statistika (markės, amžius, savivaldybės, gatvės)." },
];

export default function AboutPage() {
  return (
    <div className="min-h-dvh">
      <SiteHeader active="/apie" />
      <main className="mx-auto max-w-3xl space-y-10 px-4 py-10">
        <section>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">Apie Eismo Pulsą</h1>
          <p className="mt-3 text-[var(--muted)]">
            Eismo Pulsas sujungia oficialius policijos eismo įvykių duomenis su žmonių pastebėjimais. Oficialūs duomenys
            parodo, kur jau įvyko nelaimės; vartotojų žymos – kur jos gali įvykti. Abu sluoksnius galima žiūrėti atskirai arba
            kartu („Mix“).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Duomenų šaltiniai</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm">
            <li>
              <a className="text-[var(--accent)] hover:underline" href="https://data.gov.lt/datasets/509/">
                Policijos departamentas – eismo įvykių duomenys (EĮIS)
              </a>
              : kiekvienas įvykis su koordinatėmis, dalyviais, transporto priemonėmis (markė, modelis), amžiumi ir aplinkybėmis.
              Koordinatės perskaičiuojamos iš LKS-94 į WGS-84.
            </li>
            <li>
              <a className="text-[var(--accent)] hover:underline" href="https://osp.stat.gov.lt/rdb-rest">
                Valstybės duomenų agentūra (SDMX API)
              </a>
              : gyventojų skaičius savivaldybėse ir pagal amžių – santykiniams rodikliams.
            </li>
            <li>
              <a className="text-[var(--accent)] hover:underline" href="https://get.data.gov.lt/datasets/gov/regitra/ktpr/ValstybinisNumeris">
                Regitra
              </a>
              : išduotų valstybinių numerių skaičius pagal markę (nuo 2005 m.) – kaip registruoto parko aproksimacija.
            </li>
            <li>
              <a className="text-[var(--accent)] hover:underline" href="https://maps.ird.lt/server/rest/services/EIIS/EIIS/MapServer">
                Policijos IRD GIS
              </a>
              : avaringi ruožai („juodosios dėmės“) valstybinės reikšmės keliuose, gaunami gyvai.
            </li>
            <li>
              <a className="text-[var(--accent)] hover:underline" href="https://www.openstreetmap.org/copyright">
                OpenStreetMap
              </a>{" "}
              ir CARTO – žemėlapio pagrindas, Nominatim – adresų paieška.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Atviras API</h2>
          <div className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
            {ENDPOINTS.map((e) => (
              <div key={e.method + e.path} className="p-4">
                <code className="text-sm break-all">
                  <span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-bold ${e.method === "GET" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
                    {e.method}
                  </span>
                  {e.path}
                </code>
                <p className="mt-1.5 text-sm text-[var(--muted)]">{e.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2 text-sm text-[var(--muted)]">
          <h2 className="font-display text-xl font-semibold text-[var(--ink)]">Apribojimai</h2>
          <p>
            Policijos rinkinys atnaujinamas kartą per metus (praėjusių metų duomenys skelbiami vasarą). Kai kurie įvykiai neturi
            koordinačių ir žemėlapyje nerodomi. Gatvių pavadinimai registre ne visada vienodi, todėl gatvės statistika yra
            apytikslė.
          </p>
        </section>
      </main>
    </div>
  );
}
