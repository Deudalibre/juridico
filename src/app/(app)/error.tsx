"use client";

import { PageTitle } from "@/components/ui";

// En producción no se muestra el mensaje interno (nombres de tablas, restricciones…): queda en el
// registro del servidor con su «digest». En desarrollo sí, para diagnosticar rápido. Igual que el CRM.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const dev = process.env.NODE_ENV !== "production";
  const missingSchema = /relation .* does not exist|schema cache|Could not find the table/i.test(error.message);
  return (
    <>
      <PageTitle title="Algo ha fallado" subtitle="No se pudieron cargar los datos del área jurídica." />
      <div className="card flex max-w-[720px] flex-col gap-4 p-7">
        {dev ? (
          <code className="whitespace-pre-wrap rounded-lg border border-line-strong bg-surface-2 px-3.5 py-3 text-[12.5px] text-danger">{error.message}</code>
        ) : (
          <span className="text-[13.5px] leading-relaxed text-soft">
            Vuelve a intentarlo. Si el problema sigue, avisa al administrador{error.digest ? ` con el código ${error.digest}` : ""}.
          </span>
        )}
        {dev && missingSchema && (
          <span className="text-[13.5px] leading-relaxed text-soft">
            Parece que faltan tablas o columnas en Supabase. Ejecuta <code className="text-accent">npm run db:migrate</code> en la carpeta de Jurídico.
          </span>
        )}
        <div>
          <button className="btn-secondary" onClick={reset}>
            Reintentar
          </button>
        </div>
      </div>
    </>
  );
}
