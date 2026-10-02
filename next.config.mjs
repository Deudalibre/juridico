/** @type {import('next').NextConfig} */

// Cabeceras de seguridad para todas las respuestas (mismas que el CRM).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig = {
  poweredByHeader: false,
  // Carpeta de salida configurable: permite hacer `next build` de validación (NEXT_DIST_DIR=.next-build)
  // sin pisar la carpeta .next del servidor de desarrollo que está corriendo
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Cache Components (Next 16): cáscara estática prerenderizada + streaming de lo dinámico, «use cache» y
  // conservación del estado de las pantallas al navegar (Activity). Los layouts/páginas ya no llevan force-dynamic.
  cacheComponents: true,
  // React Compiler: memoriza los componentes del cliente solo (tablas largas, editor de plantillas)
  reactCompiler: true,
  experimental: {
    // Versión nativa (Rust) del compilador dentro de Turbopack: sin babel-plugin
    turbopackRustReactCompiler: true,
    // Navegación instantánea entre pantallas ya visitadas y precarga al pasar el mouse (igual que el CRM)
    staleTimes: { dynamic: 30 },
    dynamicOnHover: true,
  },
  // «Mi día» pasó a llamarse «Revisión» (2026-09-30): los enlaces antiguos siguen funcionando
  async redirects() {
    return [{ source: "/hoy", destination: "/revision", permanent: true }];
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
