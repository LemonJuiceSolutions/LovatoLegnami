// Durate delle registrazioni (ffprobe) → src/data/recordings.json
import { execFileSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
const dir = new URL("../public/recordings/", import.meta.url).pathname;
const out = {};
for (const f of readdirSync(dir).filter((f) => f.endsWith(".mp4"))) {
  out[f.replace(/\.mp4$/, "")] = +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", dir + f]).toString().trim();
}
writeFileSync(new URL("../src/data/recordings.json", import.meta.url), JSON.stringify(out, null, 2));
console.log(out);
