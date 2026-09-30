import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Igual que el CRM: Inter para la interfaz (nítida a 12–14 px) y Plus Jakarta Sans solo en títulos.
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "Deuda Libre · Jurídico",
  description: "Preparación de documentos jurídicos desde plantillas Word",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${sans.variable} ${display.variable}`}>
      <body className="font-sans text-sm">{children}</body>
    </html>
  );
}
