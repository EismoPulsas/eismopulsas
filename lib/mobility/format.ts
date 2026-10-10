// Lithuanian formatting for explanation sentences (pure). lt-LT decimals, the
// € sign after the number, and grammatical number (DESIGN.md › A2).

const NBSP = " ";
const eurFormat = new Intl.NumberFormat("lt-LT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const oneDecimal = new Intl.NumberFormat("lt-LT", { maximumFractionDigits: 1 });

export const eur = (n: number) => `${eurFormat.format(n)}${NBSP}€`;
export const pct = (ratio: number) => `${Math.round(ratio * 100)}${NBSP}%`;
export const times = (ratio: number) => `${oneDecimal.format(ratio)}${NBSP}karto`;
export const minutes = (n: number) => `${n}${NBSP}min.`;
/** 45 → "45 min.", 120 → "2 val.", 90 → "1 val. 30 min.". */
export function hoursMinutes(n: number): string {
  if (n < 60) return minutes(n);
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h}${NBSP}val. ${minutes(m)}` : `${h}${NBSP}val.`;
}

/** Lithuanian plural: [1 minutė, 2 minutės, 10 minučių]. */
export function plural(n: number, forms: [one: string, few: string, many: string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 9 && (mod100 < 11 || mod100 > 19)) return forms[1];
  return forms[2];
}

export const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "a", "a ir b", "a, b ir c". */
export function joinLt(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} ir ${parts[parts.length - 1]}`;
}
