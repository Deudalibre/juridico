import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Misma cobertura que tenía «next lint»: el código de la app (src). Scripts de prueba y prototipos quedan fuera.
export default defineConfig([
  globalIgnores([".next/**", ".next-build/**", "node_modules/**", "scripts/**", "prototipo/**", "next-env.d.ts"]),
  { extends: [...nextCoreWebVitals, ...nextTypescript] },
  {
    // Reglas nuevas de eslint-config-next 16 (orientadas al React Compiler). El código ya funcionaba así
    // con Next 14; quedan como aviso para ir corrigiéndolas sin bloquear el lint.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
]);
