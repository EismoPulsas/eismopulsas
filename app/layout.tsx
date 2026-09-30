import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eismo Pulsas",
  description: "Eismo įvykių žemėlapis ir statistika Lietuvoje",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="lt" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
