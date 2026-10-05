// User-reported danger spots ("balsavimas"). Shared between client and server.

export const REPORT_CATEGORIES = [
  { id: "speeding", label: "Viršijamas greitis", icon: "⚡", color: "#f97316" },
  { id: "intersection", label: "Pavojinga sankryža", icon: "✚", color: "#ef4444" },
  { id: "crossing", label: "Nesaugi perėja", icon: "🚸", color: "#eab308" },
  { id: "bike", label: "Pavojinga dviratininkams", icon: "🚲", color: "#22c55e" },
  { id: "visibility", label: "Blogas matomumas / apšvietimas", icon: "👁", color: "#a855f7" },
  { id: "road", label: "Duobės / bloga danga", icon: "▼", color: "#94a3b8" },
  { id: "other", label: "Kita", icon: "?", color: "#38bdf8" },
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number]["id"];

export type Report = {
  id: number;
  lat: number;
  lng: number;
  category: ReportCategory;
  note: string | null;
  votes: number;
  createdAt: string;
};

export const reportCategory = (id: string) => REPORT_CATEGORIES.find((c) => c.id === id) ?? REPORT_CATEGORIES.at(-1)!;

/** Reports of the same category closer than this are merged into one vote. */
export const MERGE_RADIUS_M = 35;
