"use client";

import { useEffect, useState } from "react";
import { fmtStay, isEv, lotCost, zoneCost, type Settings } from "@/lib/metrics";
import type { Charger, ChargerPlug, Connector, Lot, OccupancyProfile } from "@/lib/plan-types";
import { fmtEur } from "./format";
import type { LiveParking } from "./live";
import type { LatLng } from "@/lib/geo";
import { bikeStatus, KIND_LABEL, LOT_CLASS, lotClass, NO_PARKING, SOURCE_LABEL, speedStatus, STATUS, ZONE_COLOR, type BikeStation, type MapPick, type Sensor } from "./parking-meta";

type OccupancyFile = { weeks: number; from: string; to: string; lots: Record<string, OccupancyProfile> };

function useFile<T>(url: string, enabled: boolean): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!enabled || data) return;
    let alive = true;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url, enabled, data]);
  return data;
}

/** Now in Lithuania: date, seconds since midnight, weekday (0 = Monday). */
function vilniusNow() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vilnius", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, sec: +p.hour * 3600 + +p.minute * 60, weekday: (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7 };
}

const PLUG: Record<Connector, string> = { T2: "Type 2", CCS: "CCS", CHADEMO: "CHAdeMO", T1: "Type 1", SCHUKO: "Buitinis", OTHER: "Kita" };
const WEEKDAYS = ["Pr", "An", "Tr", "Kt", "Pn", "Š", "S"];
const WEEKDAY_FULL = ["Pirmadienis", "Antradienis", "Trečiadienis", "Ketvirtadienis", "Penktadienis", "Šeštadienis", "Sekmadienis"];
const ACCESS_LABEL: Record<Lot["access"], string> = { public: "Viešai", customers: "Klientams", pr: "Statyk ir važiuok", unknown: "Prieiga nežinoma" };
const num = (v: number, d = 2) => v.toFixed(d).replace(".", ",");

function Chip({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-[var(--panel)] px-2.5 py-0.5 text-xs font-medium text-[var(--ink)]" style={{ borderColor: tone ?? "var(--line)" }}>
      {children}
    </span>
  );
}

/** The same disc + glyph as the place's marker on the map, so card and marker read as one thing. */
function PlaceIcon({ color, glyph, square }: { color: string; glyph: React.ReactNode; square?: boolean }) {
  return (
    <span className={`grid h-9 w-9 shrink-0 place-items-center text-white ${square ? "rounded-lg" : "rounded-full"}`} style={{ background: color }}>
      {glyph}
    </span>
  );
}

const svg = (d: React.ReactNode, fill = false) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);
const GLYPH = {
  P: <b className="font-display text-base">P</b>,
  bolt: svg(<path d="M13 2 4 14h7l-1 8 9-12h-7z" />, true),
  bike: svg(
    <>
      <circle cx="5.5" cy="17" r="3.5" />
      <circle cx="18.5" cy="17" r="3.5" />
      <path d="M5.5 17 9 9h6l3.5 8M9 9 7.5 6H6m9 3-3 8" />
    </>,
  ),
  gauge: svg(
    <>
      <path d="M4 18a8 8 0 1 1 16 0" />
      <path d="m12 18 4-6" />
    </>,
  ),
  no: svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m5.6 5.6 12.8 12.8" />
    </>,
  ),
};

function header(pick: MapPick): { color: string; glyph: React.ReactNode; square?: boolean } {
  switch (pick.type) {
    case "lot":
      return { color: LOT_CLASS[lotClass(pick.lot)].color, glyph: GLYPH.P, square: true };
    case "street":
      return { color: (pick.zone && ZONE_COLOR[pick.zone.zone]) || (pick.fee === "yes" ? LOT_CLASS.paid.color : STATUS.go), glyph: GLYPH.P, square: true };
    case "noparking":
      return { color: NO_PARKING, glyph: GLYPH.no };
    case "charger":
      return { color: STATUS.go, glyph: GLYPH.bolt };
    case "bikeshare":
      return { color: bikeStatus(pick.station), glyph: GLYPH.bike };
    case "sensor":
      return { color: speedStatus(pick.sensor), glyph: GLYPH.gauge };
  }
}

/** Where the place is, for "go here"; street pieces are lines, so they have none. */
function pickPos(pick: MapPick): LatLng | null {
  switch (pick.type) {
    case "lot":
      return pick.lot.pos;
    case "charger":
      return pick.charger.pos;
    case "bikeshare":
      return pick.station.pos;
    default:
      return null;
  }
}

/** The headline number of a place, big: free bikes, speed, free spaces. */
function Headline({ color, children, aside }: { color: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm" role="status">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-0 flex-1">{children}</span>
      {aside && <span className="shrink-0 font-mono text-xs text-[var(--muted)]">{aside}</span>}
    </div>
  );
}

function BikeshareBody({ s }: { s: BikeStation }) {
  const share = s.capacity ? Math.round((s.bikes / s.capacity) * 100) : 0;
  return (
    <>
      <Headline color={bikeStatus(s)}>
        {s.open ? (
          <>
            <b className="font-mono text-base">{s.bikes}</b> dviračių · <b className="font-mono text-base">{s.docks}</b> laisvų vietų
          </>
        ) : (
          "Stotelė šiuo metu nedirba"
        )}
      </Headline>
      {s.open && s.capacity > 0 && (
        <div className="flex flex-col gap-1">
          <div className="h-2 overflow-hidden rounded-full bg-[var(--chip)]">
            <div className="h-full rounded-full" style={{ width: `${share}%`, background: bikeStatus(s) }} />
          </div>
          <span className="text-[11px] text-[var(--muted)]">Užpildyta {share} % iš {s.capacity} vietų</span>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Chip tone={STATUS.go}>Grąžinti galima į bet kurią stotelę</Chip>
      </div>
      <Source>Šaltinis: Cyclocity Vilnius (JCDecaux), GBFS – atnaujinama kas minutę.</Source>
    </>
  );
}

function SensorBody({ s }: { s: Sensor }) {
  return (
    <>
      <Headline color={speedStatus(s)} aside={s.road}>
        Vid. greitis <b className="font-mono text-base">{s.speed} km/h</b>
        {s.limit ? <span className="text-[var(--muted)]"> · leidžiama {s.limit}</span> : null}
      </Headline>
      <p className="text-sm">
        Per 15 min pravažiavo <b className="font-mono">{s.vehicles}</b> automobilių.
      </p>
      <Source>Šaltinis: Via Lietuva, eismoinfo.lt – kelių jutikliai, matavimai kas 15 min.</Source>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 border-t border-[var(--line)] pt-2.5">
      <h3 className="text-[11px] font-semibold tracking-wide text-[var(--muted)] uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Source({ children }: { children: React.ReactNode }) {
  return <p className="border-t border-[var(--line)] pt-2 text-[11px] leading-relaxed text-[var(--muted)]">{children}</p>;
}

/** "Your stay now": what the profile's usual stay would cost if you parked right now. */
function StayCost({ cost, hours, note }: { cost: number | null; hours: number; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-lg bg-[var(--chip)] px-2.5 py-1.5 text-sm">
      <span>
        {fmtStay(hours * 60)} nuo dabar
        {note && <span className="text-xs text-[var(--muted)]"> · {note}</span>}
      </span>
      <b className="tnum shrink-0">{cost == null ? "nežinoma" : cost === 0 ? "0 €" : fmtEur(cost)}</b>
    </div>
  );
}

/** One card for anything clicked on the map: car park, street piece, charger, Cyclocity station, road sensor. */
export function ParkingCard({ pick, live, settings, onClose, onGo }: { pick: MapPick; live: LiveParking | null; settings: Settings; onClose: () => void; onGo?: (p: LatLng) => void }) {
  const now = vilniusNow();
  const title =
    pick.type === "lot"
      ? (pick.lot.name ?? (pick.lot.near ? `Aikštelė prie „${pick.lot.near}“` : "Automobilių stovėjimo aikštelė"))
      : pick.type === "street"
        ? (pick.name ?? "Stovėjimas gatvėje")
        : pick.type === "noparking"
          ? "Stovėti draudžiama"
          : pick.type === "charger"
            ? pick.charger.name
            : pick.type === "bikeshare"
              ? pick.station.name
              : pick.sensor.name;
  const icon = header(pick);
  const pos = pickPos(pick);
  return (
    <div
      role="dialog"
      aria-label={title}
      className="pointer-events-auto absolute top-0 left-0 z-[600] flex max-h-full w-full flex-col overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--panel)] shadow-[0_20px_50px_rgba(15,23,42,0.2)] sm:w-[360px]"
    >
      <div className="flex items-start gap-3 p-3.5 pb-2.5">
        <PlaceIcon {...icon} />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[15px] leading-tight font-bold">{title}</h2>
          {pick.type === "lot" && (pick.lot.addr || pick.lot.city) && (
            <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{[pick.lot.addr, pick.lot.city].filter(Boolean).join(", ")}</p>
          )}
          {pick.type === "street" && <p className="mt-0.5 text-xs text-[var(--muted)]">{pick.what}</p>}
          {pick.type === "charger" && <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{[pick.charger.address, pick.charger.city].filter(Boolean).join(", ")}</p>}
          {pick.type === "bikeshare" && <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{pick.station.address || "Cyclocity stotelė"}</p>}
          {pick.type === "sensor" && <p className="mt-0.5 truncate text-xs text-[var(--muted)]">Eismo jutiklis · {pick.sensor.road}</p>}
        </div>
        <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-[var(--muted)] hover:bg-[var(--chip)] hover:text-[var(--ink)]" aria-label="Uždaryti">
          ✕
        </button>
      </div>
      <div className="flex flex-col gap-2.5 overflow-y-auto px-3 pb-3">
        {pick.type === "lot" && <LotBody lot={pick.lot} live={live} settings={settings} now={now} />}
        {pick.type === "street" && <StreetBody pick={pick} settings={settings} now={now} />}
        {pick.type === "noparking" && (
          <>
            <p className="text-sm">
              {pick.name ? <b>{pick.name}</b> : "Ši teritorija"}: JUDU duomenimis čia stovėti draudžiama.
            </p>
            <Source>Šaltinis: JUDU – draudžiamo stovėjimo zonos. Visada vadovaukitės kelio ženklais.</Source>
          </>
        )}
        {pick.type === "charger" && <ChargerBody c={pick.charger} live={live} settings={settings} />}
        {pick.type === "bikeshare" && <BikeshareBody s={pick.station} />}
        {pick.type === "sensor" && <SensorBody s={pick.sensor} />}
      </div>
      {pos && onGo && (
        <div className="border-t border-[var(--line)] p-3">
          <button
            type="button"
            onClick={() => onGo(pos)}
            className="w-full rounded-xl bg-[var(--marking)] py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Važiuoti čia (B)
          </button>
        </div>
      )}
    </div>
  );
}

function LotBody({ lot, live, settings, now }: { lot: Lot; live: LiveParking | null; settings: Settings; now: ReturnType<typeof vilniusNow> }) {
  const occ = useFile<OccupancyFile>("/data/lot-occupancy.json", !!lot.occ);
  const ev = isEv(settings);
  const chargers = useFile<{ chargers: Charger[] }>("/data/chargers.json", ev);
  const cls = LOT_CLASS[lotClass(lot)];
  const liveNow = lot.occ ? live?.lots?.[lot.occ] : undefined;
  const profile = lot.occ ? occ?.lots[lot.occ] : undefined;
  const here = chargers?.chargers.filter((c) => c.lotId === lot.id) ?? [];
  const cost = lotCost(lot.t, now.date, now.sec, settings.parkingHours);
  const evFree = settings.fuel === "electric" && settings.evPermit && lot.src === "judu" && !lot.gated && lot.t.known && !lot.t.flat;

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <Chip tone={cls.color}>
          <span className="h-2 w-2 rounded-full" style={{ background: cls.color }} />
          {cls.label}
        </Chip>
        <Chip>{ACCESS_LABEL[lot.access]}</Chip>
        {lot.kind && KIND_LABEL[lot.kind] && <Chip>{KIND_LABEL[lot.kind]}</Chip>}
        {lot.gated && <Chip>su užtvaru</Chip>}
        {lot.cap != null && <Chip>{lot.cap} vietų</Chip>}
        {lot.res && <Chip>galioja gyventojų leidimai</Chip>}
        {lot.near && <Chip>šalia „{lot.near}“</Chip>}
      </div>

      {liveNow && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-sm" role="status">
          <span className={`signal ${liveNow.vacant >= 5 ? "go" : liveNow.vacant > 0 ? "wait" : "stop"}`} aria-hidden />
          Dabar laisva <b className="tnum">{liveNow.vacant}</b> iš {liveNow.capacity}
          <span className="ml-auto text-[11px] text-[var(--muted)]">{new Date(liveNow.at).toLocaleTimeString("lt-LT", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      )}

      <Section title="Kainos ir taisyklės">
        <ul className="flex flex-col gap-0.5 text-sm">
          {lot.t.text.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
        {lot.t.monthly != null && <p className="text-xs text-[var(--muted)]">Mėnesinis abonementas nuo {fmtEur(lot.t.monthly)}</p>}
        <StayCost cost={evFree ? 0 : cost} hours={settings.parkingHours} note={evFree ? "su JUDU elektromobilio leidimu" : lot.t.assumed} />
      </Section>

      {profile && (
        <Section title="Kada lengviausia rasti vietą">
          <OccupancyChart profile={profile} weekday={now.weekday} hour={Math.floor(now.sec / 3600)} />
          {occ && (
            <p className="text-[11px] text-[var(--muted)]">
              Pagal JUDU užtvarų duomenis kas 30 s, {occ.weeks} sav. ({occ.from} – {occ.to}). „Vietą rasite“ – dalis dienų, kai tą valandą visą laiką buvo bent viena laisva vieta.
            </p>
          )}
        </Section>
      )}

      {ev && (
        <Section title="Įkrovimas">
          {here.length ? here.map((c) => <ChargerPlugs key={c.id} c={c} live={live} settings={settings} />) : <p className="text-sm text-[var(--muted)]">Valstybiniame registre šioje aikštelėje įkrovimo prieigų nėra.</p>}
        </Section>
      )}

      <Source>
        Šaltinis: {SOURCE_LABEL[lot.src]}
        {lot.op && lot.op !== "JUDU" ? ` · valdytojas ${lot.op}` : ""}
        {lot.checked ? ` · patikrinta ${lot.checked}` : ""}
        {lot.src === "osm" && " · duomenys gali būti netikslūs, vadovaukitės ženklais vietoje"}
        {lot.url && (
          <>
            {" · "}
            <a href={lot.url} target="_blank" rel="noreferrer" className="text-[var(--marking)] underline">
              daugiau
            </a>
          </>
        )}
      </Source>
    </>
  );
}

function StreetBody({ pick, settings, now }: { pick: Extract<MapPick, { type: "street" }>; settings: Settings; now: ReturnType<typeof vilniusNow> }) {
  const z = pick.zone;
  const zc = z ? zoneCost(z, now.date, now.sec, settings.parkingHours, settings) : null;
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {z ? (
          <Chip tone={ZONE_COLOR[z.zone]}>
            <span className="h-2 w-2 rounded-sm" style={{ background: ZONE_COLOR[z.zone] }} />
            {z.city}: {z.zone}
          </Chip>
        ) : (
          <Chip>ne mokamoje zonoje</Chip>
        )}
        {pick.spaces != null && <Chip>{pick.spaces} vietų</Chip>}
        {pick.maxStayMin != null && <Chip>ne ilgiau kaip {fmtStay(pick.maxStayMin)}</Chip>}
      </div>
      <Section title="Kaina">
        {z ? (
          <>
            <p className="text-sm">{z.text}</p>
            <StayCost cost={zc!.cost} hours={settings.parkingHours} note={zc!.note} />
          </>
        ) : pick.fee === "yes" ? (
          <p className="text-sm">Mokama (pagal OpenStreetMap), kaina nežinoma.</p>
        ) : (
          <p className="text-sm">Ne savivaldybės mokamoje zonoje – paprastai nemokama. Sekite ženklus vietoje.</p>
        )}
      </Section>
      {pick.area && (pick.area.spaces != null || pick.area.occupancy != null) && (
        <Section title="Šios gyventojų leidimų zonos gatvės">
          <p className="text-sm">
            {pick.area.spaces != null && (
              <>
                Iš viso ~<b className="tnum">{pick.area.spaces}</b> vietų gatvėse.{" "}
              </>
            )}
            {pick.area.occupancy != null && (
              <>
                Paprastai užimta ~<b className="tnum">{pick.area.occupancy} %</b> – {pick.area.occupancy >= 90 ? "vietą rasti sunku" : pick.area.occupancy >= 75 ? "vietą rasti galima, bet ne visada" : "vietų dažniausiai yra"}.
              </>
            )}
          </p>
          <p className="text-[11px] text-[var(--muted)]">JUDU tyrimo duomenys (data nenurodyta), ne gyvi.</p>
        </Section>
      )}
      {pick.note && <p className="text-xs text-[var(--muted)]">{pick.note}</p>}
      <Source>
        Šaltinis: {pick.src === "judu" ? "JUDU" : "OpenStreetMap"}; zonos ir tarifai – JUDU (nuo 2025-07-01). Žemėlapyje pažymėta ne kiekviena gatvė: jei gatvės nėra, tai nereiškia, kad stovėti draudžiama.
      </Source>
    </>
  );
}

function ChargerPlugs({ c, live, settings }: { c: Charger; live: LiveParking | null; settings: Settings }) {
  const status = live?.chargers?.[c.id];
  return (
    <div className="flex flex-col gap-1">
      {status && (
        <div className="flex items-center gap-2 text-sm" role="status">
          <span className={`signal ${status[0] > 0 ? "go" : "stop"}`} aria-hidden />
          Laisva <b className="tnum">{status[0]}</b> iš {status[1]} (dabar)
        </div>
      )}
      <ul className="flex flex-col gap-1">
        {c.plugs.map((p, i) => (
          <PlugRow key={i} p={p} fits={settings.connectors.includes(p.std)} carKw={p.dc ? settings.dcKw : settings.acKw} hours={settings.parkingHours} consumption={settings.consumption} battery={settings.batteryKwh} />
        ))}
      </ul>
      {c.operator && <p className="text-[11px] text-[var(--muted)]">Operatorius: {c.operator}</p>}
    </div>
  );
}

function PlugRow({ p, fits, carKw, hours, consumption, battery }: { p: ChargerPlug; fits: boolean; carKw: number; hours: number; consumption: number; battery: number }) {
  const kW = Math.min(p.kW, carKw);
  // As in lib/metrics.ts: at most 20 → 90 % of the battery.
  const kWh = Math.round(Math.min(kW * hours * 0.9, battery * 0.7));
  const price = [p.perKwh != null ? `${num(p.perKwh)} €/kWh` : null, p.perMin ? `${num(p.perMin, 3)} €/min` : null, p.parkingPerMin ? `stovėjimas ${num(p.parkingPerMin, 3)} €/min` : null]
    .filter(Boolean)
    .join(" + ");
  return (
    <li className={`rounded-lg bg-[var(--chip)] px-2.5 py-1.5 text-sm ${fits ? "" : "opacity-60"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span>
          <b>{PLUG[p.std]}</b> · {p.dc ? "DC" : "AC"} {num(p.kW, p.kW % 1 ? 1 : 0)} kW{p.n > 1 ? ` × ${p.n}` : ""}
        </span>
        <span className="shrink-0 text-xs">{fits ? "✓ tinka" : "netinka"}</span>
      </div>
      {(price || p.priceText) && <div className="text-xs text-[var(--muted)]">{price || p.priceText}</div>}
      {fits && kW > 0 && (
        <div className="text-xs text-[var(--muted)]">
          Per {fmtStay(hours * 60)} – iki ~{kWh} kWh (≈ {Math.round((kWh / consumption) * 100)} km){p.perKwh != null ? `, ~${fmtEur(kWh * p.perKwh)}` : ""}
        </div>
      )}
    </li>
  );
}

function ChargerBody({ c, live, settings }: { c: Charger; live: LiveParking | null; settings: Settings }) {
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {c.open24 === true && <Chip>visą parą</Chip>}
        {c.lotId && <Chip>aikštelėje</Chip>}
      </div>
      <ChargerPlugs c={c} live={live} settings={settings} />
      <p className="text-[11px] text-[var(--muted)]">Įkrovimo kaina – be stovėjimo mokesčio, jei vieta yra mokamoje zonoje ar aikštelėje.</p>
      <Source>Šaltinis: Via Lietuva – viešai prieinamų įkrovimo prieigų informacinė sistema (CC BY 4.0). Kainos – kaip paskelbė operatorius.</Source>
    </>
  );
}

/** 24 columns: typical free spaces each hour of the chosen weekday; the readout gives the chance of a space. */
function OccupancyChart({ profile, weekday, hour }: { profile: OccupancyProfile; weekday: number; hour: number }) {
  const [wd, setWd] = useState(weekday);
  const [h, setH] = useState(hour);
  const W = 288;
  const BASE = 78;
  const TOP = 10;
  const band = W / 24;
  const bar = 8;
  const y = (v: number) => BASE - (Math.min(v, profile.cap) / profile.cap) * (BASE - TOP);
  const free = profile.free[wd];
  const p = profile.p[wd];
  const v = free[h];
  const ph = p[h];
  const verdict = ph == null ? null : ph >= 95 ? "beveik visada" : ph >= 75 ? "dažniausiai" : ph >= 40 ? "kartais" : "retai";

  return (
    <div className="flex flex-col gap-2">
      <div className="seg" role="group" aria-label="Savaitės diena">
        {WEEKDAYS.map((d, i) => (
          <button key={d} type="button" aria-pressed={wd === i} onClick={() => setWd(i)} title={WEEKDAY_FULL[i]}>
            {d}
          </button>
        ))}
      </div>
      <p className="min-h-[2.5em] text-sm" aria-live="polite">
        <b>
          {WEEKDAY_FULL[wd]} {String(h).padStart(2, "0")}:00
        </b>
        {v == null ? (
          <span className="text-[var(--muted)]"> – duomenų nėra</span>
        ) : (
          <>
            {" "}
            – paprastai ~<b className="tnum">{v}</b> laisvų iš {profile.cap}; vietą rasite <b>{verdict}</b>{" "}
            <span className="text-[var(--muted)]">
              ({ph} % iš {profile.n[wd][h]} d.)
            </span>
          </>
        )}
      </p>
      <svg viewBox={`0 0 ${W} 96`} className="w-full" role="img" aria-label={`Tipiškas laisvų vietų skaičius kiekvieną valandą, ${WEEKDAY_FULL[wd].toLowerCase()}`}>
        <line x1={0} x2={W} y1={TOP} y2={TOP} stroke="var(--line)" strokeWidth={1} />
        <text x={0} y={TOP - 3} fontSize={9} fill="var(--muted)">
          talpa {profile.cap}
        </text>
        <line x1={0} x2={W} y1={BASE} y2={BASE} stroke="var(--line)" strokeWidth={1} />
        {free.map((f, i) => {
          const x = i * band + (band - bar) / 2;
          const top = f == null ? BASE : y(f);
          const r = Math.min(4, (BASE - top) / 2, bar / 2);
          const d = `M${x},${BASE}V${top + r}Q${x},${top} ${x + r},${top}H${x + bar - r}Q${x + bar},${top} ${x + bar},${top + r}V${BASE}Z`;
          return (
            <g key={i}>
              {f != null && f > 0 && <path d={d} fill="var(--transit)" opacity={i === h ? 1 : 0.5} />}
              {/* The whole column is the hover / focus target. */}
              <rect
                x={i * band}
                y={0}
                width={band}
                height={BASE}
                fill="transparent"
                tabIndex={0}
                aria-label={`${String(i).padStart(2, "0")}:00 – ${f == null ? "duomenų nėra" : `~${f} laisvų, vieta ${p[i]} % dienų`}`}
                onPointerEnter={() => setH(i)}
                onFocus={() => setH(i)}
                style={{ outline: "none", cursor: "default" }}
              />
            </g>
          );
        })}
        <rect x={h * band + 0.5} y={TOP} width={band - 1} height={BASE - TOP} fill="none" stroke="var(--marking)" strokeWidth={1} opacity={0.6} pointerEvents="none" />
        {[0, 6, 12, 18].map((t) => (
          <text key={t} x={t * band + band / 2} y={BASE + 13} fontSize={9} fill="var(--muted)" textAnchor="middle">
            {String(t).padStart(2, "0")}
          </text>
        ))}
      </svg>
      <details className="text-xs">
        <summary className="cursor-pointer text-[var(--muted)]">Lentelė</summary>
        <table className="mt-1 w-full text-left tnum">
          <thead className="text-[var(--muted)]">
            <tr>
              <th className="font-normal">Val.</th>
              <th className="font-normal">Laisva ~</th>
              <th className="font-normal">Vieta rasta, % d.</th>
            </tr>
          </thead>
          <tbody>
            {free.map((f, i) => (
              <tr key={i}>
                <td>{String(i).padStart(2, "0")}:00</td>
                <td>{f ?? "–"}</td>
                <td>{p[i] ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

