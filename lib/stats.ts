// Shape of public/data/stats.json (written by scripts/build-data.mjs).

export type YearAgg = { all: number; counted: number; killed: number; injured: number; bike?: number };

export type Stats = {
  generatedAt: string;
  years: number[];
  yearTotals: Record<string, YearAgg>;
  municipalities: {
    code: string;
    name: string;
    population: Record<string, number>;
    years: Record<string, YearAgg & { bike: number }>;
  }[];
  makes: {
    make: string;
    all: number;
    culprit: number;
    killed: number;
    byYear: Record<string, number>;
    registered: number | null;
  }[];
  ages: { label: string; population: number; drivers: number; culprits: number; killed: number; drunk: number }[];
  streets: { code: string; street: string; all: number; counted: number; killed: number; injured: number }[];
  hourWeek: number[][];
  busStopsBmw: { date: string; place: string; model: string | null; lat: number; lng: number }[];
  fun: {
    drunkCulprits: number;
    culprits: number;
    fled: number;
    friday13: number;
    animals: number;
    scooters: number;
    bikes: number;
    busStops: number;
    busStopMakes: { make: string; n: number }[];
    topAddresses: { place: string; n: number }[];
  };
  sources: { name: string; url: string }[];
};

/** "Vilniaus m. sav." -> "Vilniaus m." */
export const shortMuni = (name: string) => name.replace(/\s*sav\.$/, "").trim();
