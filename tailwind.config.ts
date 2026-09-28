import type { Config } from "tailwindcss";

// Colores = variables de diseño de Deuda Libre (definidas en globals.css)
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--app-background)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-secondary)",
        "surface-active": "var(--surface-active)",
        sunken: "var(--surface-secondary)",
        line: "var(--border)",
        "line-soft": "var(--border-soft)",
        "line-strong": "var(--border-strong)",
        fg: "var(--text-primary)",
        muted: "var(--text-secondary)",
        soft: "var(--text-soft)",
        faint: "var(--text-faint)",
        graphite: "var(--brand-graphite)",
        brand: "var(--brand-primary)",
        // «accent» es el turquesa funcional para textos y enlaces
        accent: "var(--brand-dark)",
        "brand-line": "var(--brand-line)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
