export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-12">
      <div className="flex w-full max-w-[400px] flex-col gap-7">
        <div className="flex items-center gap-3">
          {/* Marca provisional: el archivo del logo no está en el proyecto */}
          <div className="rail-brand !mb-0">DL</div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[15px] font-semibold tracking-[-0.01em] text-graphite">Deuda Libre</span>
            <span className="text-[11.5px] text-muted">Área jurídica · documentos</span>
          </div>
        </div>
        {!configured && (
          <div className="alert-error leading-relaxed">
            Supabase no está configurado. Rellena <code>NEXT_PUBLIC_SUPABASE_URL</code> y <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> en{" "}
            <code>.env.local</code> y reinicia <code>npm run dev</code>.
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
