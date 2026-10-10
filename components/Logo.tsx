import Link from "next/link";

/** Wordmark with a sideways traffic light; the green signal breathes. */
export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Eismo Pulsas – pradžia">
      <svg width="38" height="18" viewBox="0 0 38 18" aria-hidden>
        <rect x="0.5" y="0.5" width="37" height="17" rx="8.5" fill="#0a0b0e" stroke="var(--line)" />
        <circle cx="9" cy="9" r="4.2" fill="var(--stop)" opacity="0.35" />
        <circle cx="19" cy="9" r="4.2" fill="var(--wait)" opacity="0.35" />
        <circle cx="29" cy="9" r="4.2" fill="var(--go)" className="logo-go" />
      </svg>
      <span className="font-display text-[17px] leading-none font-bold tracking-tight">
        Eismo<span className="text-[var(--marking)]">Pulsas</span>
      </span>
    </Link>
  );
}
