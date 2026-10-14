// Copia il kernel OpenCascade (WASM + glue JS) di `replicad-opencascadejs` in
// `public/occt/`, da cui il worker del configuratore lo carica a runtime
// (`locateFile` → `/occt/…`). Eseguito da `postinstall`, `predev`, `prebuild`
// e `pretest:geometry`: non si fa affidamento solo su `postinstall` perché gli
// script di installazione possono essere bloccati dalla policy di npm.
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = dirname(require.resolve("replicad-opencascadejs/package.json"));
const outDir = join(root, "public", "occt");
const FILES = ["replicad_single.wasm", "replicad_single.js"];

mkdirSync(outDir, { recursive: true });
for (const name of FILES) {
  const src = join(srcDir, "dist", name);
  const dst = join(outDir, name);
  if (!existsSync(src)) {
    console.error(`[copy-occt-wasm] file mancante: ${src}`);
    process.exit(1);
  }
  const s = statSync(src);
  if (existsSync(dst)) {
    const d = statSync(dst);
    if (d.size === s.size && d.mtimeMs >= s.mtimeMs) continue;
  }
  copyFileSync(src, dst);
  console.log(`[copy-occt-wasm] ${name} → public/occt/ (${(s.size / 1e6).toFixed(1)} MB)`);
}
