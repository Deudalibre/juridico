"use client";

import { Icon } from "./icons";

/**
 * Descarga una tabla como CSV (separador «;» y BOM para que Excel en español la abra bien).
 * Exporta solo lo que el usuario ya está viendo: no hace consultas nuevas.
 */
export function ExportButton({ filename, header, rows, label = "Exportar" }: { filename: string; header: string[]; rows: (string | number | null)[][]; label?: string }) {
  const cell = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const download = () => {
    const csv = "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button type="button" className="btn-outline" onClick={download} disabled={rows.length === 0}>
      <Icon name="download" size={14} />
      {label}
    </button>
  );
}
