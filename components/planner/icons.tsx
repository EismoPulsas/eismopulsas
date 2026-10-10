import type { ModeId } from "@/lib/metrics";

type P = { size?: number; className?: string };

const svg = (size: number, className: string | undefined, children: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
    {children}
  </svg>
);

export const CarIcon = ({ size = 20, className }: P) =>
  svg(size, className, <>
    <path d="M5 16.5V12l1.8-4.6A2 2 0 0 1 8.7 6h6.6a2 2 0 0 1 1.9 1.4L19 12v4.5" />
    <path d="M3.5 12h17v4.5h-17z" />
    <circle cx="7.5" cy="14.3" r="0.6" fill="currentColor" />
    <circle cx="16.5" cy="14.3" r="0.6" fill="currentColor" />
    <path d="M6 16.5V19M18 16.5V19" />
  </>);

export const BusIcon = ({ size = 20, className }: P) =>
  svg(size, className, <>
    <rect x="5" y="3.5" width="14" height="14" rx="2.5" />
    <path d="M5 10.5h14M9 6.5h6" />
    <circle cx="8.5" cy="14" r="0.7" fill="currentColor" />
    <circle cx="15.5" cy="14" r="0.7" fill="currentColor" />
    <path d="M7.5 17.5V20M16.5 17.5V20" />
  </>);

export const TrolleyIcon = ({ size = 20, className }: P) =>
  svg(size, className, <>
    <path d="M9 1.5 11 5M15 1.5 13 5" />
    <rect x="5" y="5" width="14" height="13" rx="2.5" />
    <path d="M5 11h14" />
    <circle cx="8.5" cy="14.8" r="0.7" fill="currentColor" />
    <circle cx="15.5" cy="14.8" r="0.7" fill="currentColor" />
    <path d="M7.5 18v2.5M16.5 18v2.5" />
  </>);

export const BikeIcon = ({ size = 20, className }: P) =>
  svg(size, className, <>
    <circle cx="6" cy="16" r="3.5" />
    <circle cx="18" cy="16" r="3.5" />
    <path d="M6 16 9.5 9h6l2.5 7M9.5 9 12 16h-6M14 6.5h2.5l-1 2.5" />
  </>);

export const ScooterIcon = ({ size = 20, className }: P) =>
  svg(size, className, <>
    <circle cx="5.5" cy="18" r="2.5" />
    <circle cx="18.5" cy="18" r="2.5" />
    <path d="M8 18h8M16.5 18 13.5 5H16M13.5 5h-2" />
  </>);

/** Bicycle with a dock bar: station-based shared bike. */
export const BikeshareIcon = ({ size = 20, className }: P) =>
  svg(size, className, <>
    <circle cx="6" cy="15" r="3.3" />
    <circle cx="18" cy="15" r="3.3" />
    <path d="M6 15 9.3 8.5h5.4L18 15M9.3 8.5 11.8 15H6M13.6 6h2.2" />
    <path d="M3 21h18" />
  </>);

export const WalkIcon = ({ size = 20, className }: P) =>
  svg(size, className, <>
    <circle cx="13" cy="4" r="1.8" />
    <path d="m9 21 2.5-6.5L14 17v4M11.5 14.5 12.5 9l-3 1.5L8 13.5M12.5 9l2.5 3 3 1" />
  </>);

export const FerryIcon = ({ size = 20, className }: P) =>
  svg(size, className, <>
    <path d="M3 18c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0" />
    <path d="M5 15 4 11h16l-1 4M8 11V7h8v4M12 7V4" />
  </>);

export const TreeIcon = ({ size = 20, className }: P) =>
  svg(size, className, <>
    <path d="M12 21v-5" />
    <path d="M12 3 6.5 10H9l-3.5 5h13L15 10h2.5z" fill="currentColor" fillOpacity={0.25} />
  </>);

export const SwapIcon = ({ size = 18, className }: P) =>
  svg(size, className, <path d="M7 4v16M7 4 4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3" />);

export const LocateIcon = ({ size = 18, className }: P) =>
  svg(size, className, <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </>);

export const PinIcon = ({ size = 18, className }: P) =>
  svg(size, className, <>
    <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15 12 21 12 21z" />
    <circle cx="12" cy="10" r="2.3" />
  </>);

export const GearIcon = ({ size = 18, className }: P) =>
  svg(size, className, <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
  </>);

export const LayersIcon = ({ size = 18, className }: P) =>
  svg(size, className, <>
    <path d="m12 3 9 5-9 5-9-5z" />
    <path d="m3 13 9 5 9-5" />
  </>);

export const ChevronIcon = ({ size = 16, className }: P) => svg(size, className, <path d="m6 9 6 6 6-6" />);

export const ClockIcon = ({ size = 16, className }: P) =>
  svg(size, className, <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>);

export const CoinIcon = ({ size = 16, className }: P) =>
  svg(size, className, <>
    <circle cx="12" cy="12" r="9" />
    <path d="M15 8.5a4 4 0 1 0 0 7M7.5 11h6M7.5 13.5h6" />
  </>);

export const LeafIcon = ({ size = 16, className }: P) =>
  svg(size, className, <>
    <path d="M5 19c0-9 5-14 15-14 0 10-5 15-14 15" />
    <path d="M5 19c3-4 6-7 10-9" />
  </>);

export const FlameIcon = ({ size = 16, className }: P) =>
  svg(size, className, <path d="M12 21c-4 0-6.5-2.6-6.5-6 0-4 3.5-5.5 4-10 3 2 6 5 6 8.5 1-1 1.5-2 1.5-3 1.5 1.5 2 3 2 4.5 0 3.4-2.9 6-7 6z" />);

/** Mode glyph on a road-sign-like plate. */
export function ModeBadge({ mode, size = 40 }: { mode: ModeId; size?: number }) {
  const Icon = { car: CarIcon, transit: BusIcon, bikeshare: BikeshareIcon, scooter: ScooterIcon, bike: BikeIcon, walk: WalkIcon }[mode];
  // Car keeps a red-rimmed "prohibition" look; the rest are blue mandatory / information signs.
  const round = mode === "bike" || mode === "walk" || mode === "car" || mode === "scooter";
  return (
    <span
      className="grid shrink-0 place-items-center text-white"
      style={{
        width: size,
        height: size,
        borderRadius: round ? "50%" : 9,
        background: mode === "car" ? "#fff" : "var(--sign-blue)",
        color: mode === "car" ? "#111" : "#fff",
        boxShadow: mode === "car" ? "inset 0 0 0 4px var(--stop)" : "inset 0 0 0 2px rgba(255,255,255,.9)",
      }}
    >
      <Icon size={size * 0.52} />
    </span>
  );
}

export const SunIcon = ({ size = 18, className }: P) =>
  svg(size, className, <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>);

export const CloudIcon = ({ size = 18, className }: P) => svg(size, className, <path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z" />);

export const RainIcon = ({ size = 18, className }: P) =>
  svg(size, className, <>
    <path d="M7 14h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 5.5 4.3 4.3 0 0 0 7 14z" />
    <path d="m8 17-1 3M12 17l-1 3M16 17l-1 3" />
  </>);

export const SnowIcon = ({ size = 18, className }: P) =>
  svg(size, className, <>
    <path d="M7 13h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 4.5 4.3 4.3 0 0 0 7 13z" />
    <path d="M8 17v.01M12 19v.01M16 17v.01M10 21v.01M14 21v.01" strokeWidth={2.6} />
  </>);

export const FogIcon = ({ size = 18, className }: P) =>
  svg(size, className, <>
    <path d="M7 11h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 2.5" />
    <path d="M4 15h16M6 19h12" />
  </>);
