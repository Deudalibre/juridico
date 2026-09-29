import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Misma fuente variable que el CRM (tema compartido)
const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Deuda Libre · Jurídico",
  description: "Preparación de documentos jurídicos desde plantillas Word",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={sans.variable}>
      <body className="font-sans text-sm">{children}</body>
    </html>
  );
}
