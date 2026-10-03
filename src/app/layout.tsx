import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Igual que el CRM: Inter para la interfaz (nítida a 12–14 px) y Plus Jakarta Sans solo en títulos.
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-display", display: "swap" });

// Cada pantalla declara su título («Revisión», «Causas»…) y la pestaña del navegador lo muestra
// con la marca detrás. El icono sale de src/app/icon.svg y apple-icon.tsx (los mismos del CRM).
export const metadata: Metadata = {
  title: { default: "Deuda Libre · Jurídico", template: "%s · Jurídico · Deuda Libre" },
  description: "Área jurídica de Deuda Libre: revisión de causas, clientes y documentos desde plantillas Word.",
  applicationName: "Deuda Libre Jurídico",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#087f9c",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${sans.variable} ${display.variable}`}>
      <body className="font-sans text-sm">{children}</body>
    </html>
  );
}
