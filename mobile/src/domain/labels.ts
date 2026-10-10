// Lithuanian UI labels for contract values (DESIGN.md › B18).

import type { Basis, FuelType, MobilityProfile, Preference, Strategy } from "@/api/contract";

export const PREFERENCE_LT: Record<Preference, string> = {
  fastest: "Greičiausia",
  cheapest: "Pigiausia",
  greener: "Žaliausia",
  balanced: "Subalansuota",
};

export const PREFERENCE_HINT_LT: Record<Preference, string> = {
  fastest: "Mažiausiai laiko kelyje",
  cheapest: "Mažiausia kaina",
  greener: "Mažiausiai CO₂",
  balanced: "Šiek tiek lėčiau, jei gerokai pigiau ar švariau",
};

export const FUEL_LT: Record<FuelType, string> = {
  petrol: "Benzinas",
  diesel: "Dyzelinas",
  lpg: "Dujos (LPG)",
  hybrid: "Hibridas",
  electric: "Elektra",
};

export const STRATEGY_LT: Record<Strategy, string> = {
  car: "Automobiliu",
  transit: "Viešuoju transportu",
  park_and_ride: "„Statyk ir važiuok“ (P+R)",
};

export const BASIS_LT: Record<Basis, string> = {
  demo: "demonstraciniai",
  estimate: "apytiksliai",
  official: "oficialūs",
  live: "tikralaikiai",
};

export function profileLine(p: MobilityProfile): string {
  const unit = p.car.fuel === "electric" ? "kWh" : "l";
  const car = p.car.available
    ? `automobilis (${FUEL_LT[p.car.fuel].toLowerCase()}, ${String(p.car.consumption).replace(".", ",")} ${unit}/100 km)`
    : "be automobilio";
  return `${car}${p.transitPass ? " · VT bilietas" : ""} · ${PREFERENCE_LT[p.preference]}`;
}
