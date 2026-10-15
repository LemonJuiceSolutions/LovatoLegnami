// Copia il kernel OpenCascade (WASM + glue JS) di `replicad-opencascadejs` in
// `public/occt/<versione>/` (versione del pacchetto), da cui il worker del
// configuratore lo carica a runtime (`locateFile` → `/occt/<versione>/…`, P12).
// La versione nel percorso rende sicura la cache immutabile di un anno
// (`next.config.js` `headers()`): un aggiornamento del pacchetto cambia l'URL.
// Eseguito da `postinstall`, `predev`, `prebuild` e `pretest:geometry`: non si fa
// affidamento solo su `postinstall` perché gli script di installazione possono
// essere bloccati dalla policy di npm. Le copie di altre versioni (e i file della
// vecchia disposizione senza versione) sono rimosse.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgFile = require.resolve("replicad-opencascadejs/package.json");
const srcDir = dirname(pkgFile);
const { version } = JSON.parse(readFileSync(pkgFile, "utf8"));
const baseDir = join(root, "public", "occt");
const outDir = join(baseDir, version);
const FILES = ["replicad_single.wasm", "replicad_single.js"];

mkdirSync(outDir, { recursive: true });
for (const entry of readdirSync(baseDir)) {
  if (entry === version) continue;
  rmSync(join(baseDir, entry), { recursive: true, force: true });
  console.log(`[copy-occt-wasm] rimosso public/occt/${entry}`);
}
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
  console.log(`[copy-occt-wasm] ${name} → public/occt/${version}/ (${(s.size / 1e6).toFixed(1)} MB)`);
}
