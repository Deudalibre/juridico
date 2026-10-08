// Genera public/icons.svg (sprite de iconos) a partir de la tabla ICON_NAMES de src/components/icons.tsx y actualiza
// la versión del sprite en ese archivo para que el navegador no use una copia vieja. Se corre con `npm run icons`
// cada vez que se agrega o cambia un icono.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const lucide = require("lucide-react");

const file = "src/components/icon-names.ts";
let src = readFileSync(file, "utf8");
const block = src.match(/ICON_NAMES = \{([\s\S]*?)\n\} as const/)?.[1];
if (!block) throw new Error(`No encuentro la tabla ICON_NAMES en ${file}`);
const entries = [...block.matchAll(/^\s*(\w+): "(\w+)",?\s*$/gm)].map((m) => [m[1], m[2]]);

const symbols = entries.map(([key, comp]) => {
  const C = lucide[comp];
  if (!C) throw new Error(`Lucide no tiene el icono ${comp} (usado como «${key}»)`);
  const svg = renderToStaticMarkup(createElement(C, { size: 24 }));
  const inner = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  return `<symbol id="i-${key}" viewBox="0 0 24 24">${inner}</symbol>`;
});
const sprite = `<svg xmlns="http://www.w3.org/2000/svg">${symbols.join("")}</svg>\n`;
mkdirSync("public", { recursive: true });
writeFileSync("public/icons.svg", sprite);

const v = createHash("sha1").update(sprite).digest("hex").slice(0, 8);
const updated = src.replace(/SPRITE = "\/icons\.svg\?v=[0-9a-f]*"/, () => `SPRITE = "/icons.svg?v=${v}"`);
if (updated === src && !src.includes(`v=${v}`)) throw new Error(`No encuentro la constante SPRITE en ${file}`);
writeFileSync(file, updated);
console.log(`public/icons.svg · ${entries.length} iconos · ${(sprite.length / 1024).toFixed(1)} KB · v=${v}`);
