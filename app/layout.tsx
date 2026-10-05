import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter" });
const grotesk = Space_Grotesk({ subsets: ["latin", "latin-ext"], variable: "--font-grotesk" });

export const metadata: Metadata = {
  title: { default: "Eismo Pulsas", template: "%s · Eismo Pulsas" },
  description: "Interaktyvus Lietuvos eismo įvykių žemėlapis, pavojingų vietų žymėjimas ir statistika iš atvirų duomenų.",
};

export const viewport: Viewport = { themeColor: "#0b0d12" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="lt" className={`h-full ${inter.variable} ${grotesk.variable}`}>
      <body className="h-full antialiased">{children}</body>
    </html>
  );
}
