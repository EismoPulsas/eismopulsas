import type { Metadata, Viewport } from "next";
import { Inter, Overpass } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter" });
const display = Overpass({ subsets: ["latin", "latin-ext"], variable: "--font-display-face" });

export const metadata: Metadata = {
  title: { default: "Eismo Pulsas", template: "%s · Eismo Pulsas" },
  description:
    "Kuo važiuoti iš A į B Lietuvoje: automobilis, viešasis transportas, dviratis ar pėsčiomis. Laikas su spūstimis ir A juostomis, kaina su parkavimu, CO₂ – iš atvirų miestų duomenų.",
};

export const viewport: Viewport = { themeColor: "#0c0e12" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="lt" className={`h-full ${inter.variable} ${display.variable}`}>
      <body className="h-full antialiased">{children}</body>
    </html>
  );
}
