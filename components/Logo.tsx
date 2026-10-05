import Link from "next/link";

/** Wordmark with an ECG "pulse" line drawn through it. */
export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="Eismo Pulsas – pradžia">
      <svg width="34" height="22" viewBox="0 0 34 22" aria-hidden className="ep-ecg">
        <path
          d="M1 13 H9 L12 5 L16 19 L20 2 L23 13 H33"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="font-display text-[17px] leading-none font-bold tracking-tight">
        Eismo<span className="text-[var(--accent)]">Pulsas</span>
      </span>
    </Link>
  );
}
