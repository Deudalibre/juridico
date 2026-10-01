"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui";
import { Icon } from "@/components/icons";

export type YearSummary = { year: string; total: number; pending: number; overdue: number; critical: number; months: { month: number; total: number; pending: number }[] };

const MONTH_NAMES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** Botón «Revisar»: pide año y mes (o todo el año) y muestra solo esas causas. */
export function ReviewPicker({ summary, anio, mes, base }: { summary: YearSummary[]; anio: string; mes: number; base: { ver: string; proc: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const years = summary.filter((y) => y.year !== "sin");
  const [year, setYear] = useState(anio && anio !== "sin" ? anio : years[years.length - 1]?.year ?? "");
  const [month, setMonth] = useState(mes ? String(mes) : "");
  const current = summary.find((y) => y.year === year);
  const monthOpts = [{ key: "", label: "Todo el año" }, ...(current?.months ?? []).map((m) => ({ key: String(m.month), label: `${MONTH_NAMES[m.month]} · ${m.pending} por revisar` }))];

  const go = () => {
    const q = new URLSearchParams();
    if (base.ver) q.set("ver", base.ver);
    if (base.proc) q.set("proc", base.proc);
    if (year) q.set("anio", year);
    if (month) q.set("mes", month);
    setOpen(false);
    router.push(`/revision?${q.toString()}`);
  };

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)} disabled={years.length === 0}>
        <Icon name="today" size={14} /> Revisar
      </button>
      {open && (
        <Modal title="¿Qué causas revisamos?" subtitle="Elige el año y el mes de ingreso, como en las hojas del Excel." onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-4">
            <Field label="Año">
              <Select
                ariaLabel="Año"
                value={year}
                options={years.map((y) => ({ key: y.year, label: `${y.year} · ${y.pending} por revisar de ${y.total}` }))}
                onChange={(y) => {
                  setYear(y);
                  setMonth("");
                }}
              />
            </Field>
            <Field label="Mes">
              <Select ariaLabel="Mes" value={month} options={monthOpts} onChange={setMonth} />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                Cancelar
              </button>
              <button type="button" className="btn-primary" onClick={go} disabled={!year}>
                Ver causas
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
