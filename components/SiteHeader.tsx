import Link from "next/link";
import { Logo } from "./Logo";

const LINKS = [
  { href: "/", label: "Žemėlapis" },
  { href: "/statistika", label: "Statistika" },
  { href: "/apie", label: "Apie / API" },
];

export function SiteHeader({ active }: { active: string }) {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--panel)]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5">
        <Logo />
        <nav className="ml-auto flex items-center gap-1 text-sm">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active === l.href ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 ${
                active === l.href ? "bg-[var(--chip)] font-medium" : "text-[var(--muted)] hover:bg-[var(--chip)] hover:text-[var(--ink)]"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
