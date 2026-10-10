const clock = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Vilnius", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

export function localParts(at: number | string) {
  const p = Object.fromEntries(clock.formatToParts(new Date(at)).map((v) => [v.type, v.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, sec: +p.hour * 3600 + +p.minute * 60 + +p.second };
}

/** Resolve local Lithuanian time independently of the server timezone. */
export function localTimestamp(raw: string): number {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/.exec(raw);
  if (!m || +m[2] > 23 || +m[3] > 59 || +(m[4] ?? 0) > 59) throw new Error("Neteisingas išvykimo laikas.");
  const sec = +m[2] * 3600 + +m[3] * 60 + +(m[4] ?? 0);
  const naive = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4] ?? "00"}Z`);
  if (!Number.isFinite(naive) || new Date(naive).toISOString().slice(0, 10) !== m[1]) throw new Error("Neteisinga išvykimo data.");
  const offsets = new Set<number>();
  for (const delta of [-86400000, 0, 86400000]) {
    const sample = naive + delta;
    const p = localParts(sample);
    offsets.add(Date.parse(`${p.date}T00:00:00Z`) + p.sec * 1000 - sample);
  }
  const candidates = [...offsets].map((o) => naive - o).filter((at) => {
    const p = localParts(at);
    return p.date === m[1] && p.sec === sec;
  });
  if (!candidates.length) throw new Error("Šio vietinio laiko nėra dėl laikrodžio persukimo. Pasirinkite kitą laiką.");
  return Math.min(...candidates); // earlier occurrence when clocks go back
}

export function observationTime(raw: string): number | null {
  try {
    const value = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw) ? Date.parse(raw) : localTimestamp(raw);
    return Number.isFinite(value) ? value : null;
  } catch { return null; }
}

export function departure(param: string | null, now = Date.now()) {
  let instant = now;
  if (param !== null) {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(param)) {
      const date = param.slice(0, 10);
      const check = Date.parse(`${date}T00:00:00Z`);
      instant = Date.parse(param);
      if (!Number.isFinite(check) || new Date(check).toISOString().slice(0, 10) !== date || !Number.isFinite(instant) || +param.slice(11, 13) > 23 || +param.slice(14, 16) > 59 || +param.slice(17, 19) > 59) throw new Error("Neteisingas išvykimo laikas.");
    } else instant = localTimestamp(param);
  }
  const { date, sec } = localParts(instant);
  return { date, sec, weekday: new Date(`${date}T00:00:00Z`).getUTCDay(), isNow: Math.abs(instant - now) <= 5 * 60000, at: new Date(instant).toISOString() };
}

/** Wall-clock seconds, including days after the departure date, for parking rules. */
export function localSecondsAt(at: string | number, date: string): number {
  const p = localParts(at);
  return (Date.parse(`${p.date}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 1000 + p.sec;
}

export function carDeparture(depart: ReturnType<typeof departure>) {
  const next = departure(new Date(Date.parse(depart.at) + 120000).toISOString());
  return { ...next, isNow: depart.isNow };
}
