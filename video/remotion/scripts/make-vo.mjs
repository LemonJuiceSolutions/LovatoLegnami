// Genera la voce per scena con macOS `say`, la converte con `afconvert`,
// misura le durate con `afinfo` e scrive:
//   public/vo/scene-XX.aiff / .wav
//   src/data/vo-timing.json   (durate audio e cue dei sottotitoli, letto dalla timeline)
//   public/subtitles.srt e ../out/espeiria-lovato.it.srt
//
// Uso: node scripts/make-vo.mjs [--voice Alice] [--rate 175]
// Per una voce esterna (ElevenLabs, voce umana...): mettere i file public/vo/scene-XX.wav
// e lanciare `node scripts/make-vo.mjs --skip-tts` per ricalcolare solo durate e SRT.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { VO, FPS, PAD_IN, PAD_OUT, screenText, ttsText } from "../src/data/vo-text.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const voDir = join(root, "public", "vo");
mkdirSync(voDir, { recursive: true });

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const engine = arg("engine", "edge");
const voice = arg("voice", engine === "edge" ? "it-IT-GiuseppeMultilingualNeural" : "Alice");
const edgeRate = arg("edge-rate", "+8%");
const EDGE = join(root, "..", "..", "..", "tts-venv", "bin", "edge-tts");
const rate = arg("rate", "175");
const skipTts = process.argv.includes("--skip-tts");

// Sottotitoli: a schermo il nome resta sempre "espeirIA".
const toScreen = (s) => screenText(s);

// Spezza il testo in cue di max 2 righe x 42 caratteri, rispettando la punteggiatura.
function chunk(text, max = 42 * 2 - 4) {
  const sentences = text.match(/[^.:;!?]+[.:;!?]*/g).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const s of sentences) {
    if (s.length <= max) { out.push(s); continue; }
    // spezza su virgole, poi su parole
    let cur = "";
    for (const part of s.split(/(?<=,)\s+/)) {
      if ((cur + " " + part).trim().length <= max) { cur = (cur + " " + part).trim(); continue; }
      if (cur) out.push(cur);
      if (part.length <= max) { cur = part; continue; }
      cur = "";
      for (const w of part.split(" ")) {
        if ((cur + " " + w).trim().length <= max) cur = (cur + " " + w).trim();
        else { out.push(cur); cur = w; }
      }
    }
    if (cur) out.push(cur);
  }
  // unisce cue troppo corti al successivo
  const merged = [];
  let carry = "";
  for (let c of out) {
    if (carry) { c = `${carry} ${c}`; carry = ""; }
    // "espeirIA:" e simili introducono la frase seguente: si attaccano a quella
    if (c.length < 14 && c.endsWith(":")) { carry = c; continue; }
    const last = merged[merged.length - 1];
    if (last && (last.length < 18 || c.length < 14) && (last + " " + c).length <= max) merged[merged.length - 1] = last + " " + c;
    else merged.push(c);
  }
  if (carry) merged.push(carry);
  return merged;
}

// due righe bilanciate
function wrap(line, width = 42) {
  if (line.length <= width) return line;
  const words = line.split(" ");
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
    if (a.length > width || b.length > width) continue;
    const score = Math.abs(a.length - b.length);
    if (!best || score < best.score) best = { a, b, score };
  }
  return best ? `${best.a}\n${best.b}` : line;
}

const scenes = [];
for (const s of VO) {
  const base = join(voDir, `scene-${s.id}`);
  if (!skipTts) {
    if (engine === "edge") {
      // voce neurale Microsoft (edge-tts, nessuna chiave): mp3 → wav 48 kHz mono
      const txt = ttsText(s.text).replace(/\s*\[\[slnc \d+\]\]\s*/g, " ").trim();
      for (let k = 1; ; k++) {
        try { execFileSync(EDGE, ["--voice", voice, "--rate", edgeRate, "--text", txt, "--write-media", `${base}.mp3`], { stdio: "pipe" }); break; }
        catch (e) { if (k >= 5) throw e; execFileSync("sleep", [String(2 * k)]); }
      }
      execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", `${base}.mp3`, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", `${base}.wav`]);
    } else {
      execFileSync("say", ["-v", voice, "-r", rate, "-o", `${base}.aiff`, ttsText(s.text)]);
      execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@48000", "-c", "1", `${base}.aiff`, `${base}.wav`]);
    }
  }
  if (!existsSync(`${base}.wav`)) throw new Error(`manca ${base}.wav`);
  const info = execFileSync("afinfo", [`${base}.wav`]).toString();
  const seconds = parseFloat(info.match(/estimated duration:\s*([\d.]+)/)[1]);
  // tempi dei cue proporzionali ai caratteri (le pause di punteggiatura pesano un po' di più)
  const cues = chunk(toScreen(s.text));
  const weight = (c) => c.length + (c.match(/[,.:;]/g) || []).length * 6;
  const total = cues.reduce((a, c) => a + weight(c), 0);
  let t = 0;
  const timed = cues.map((c) => {
    const d = (weight(c) / total) * seconds;
    const cue = { start: t, end: t + d, text: wrap(c) };
    t += d;
    return cue;
  });
  scenes.push({ id: s.id, file: `vo/scene-${s.id}.wav`, seconds, cues: timed });
  console.log(`scene-${s.id}: ${seconds.toFixed(2)} s, ${timed.length} cue`);
}

// timeline in frame: la durata della voce decide la durata della scena
let from = 0;
const srt = [];
const fmt = (sec) => {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};
for (const [i, sc] of scenes.entries()) {
  const min = VO[i].minSeconds;
  sc.from = from;
  sc.durationInFrames = Math.ceil(Math.max(min, PAD_IN + sc.seconds + PAD_OUT + (VO[i].extra || 0)) * FPS);
  sc.voiceStartFrame = Math.round(PAD_IN * FPS);
  for (const c of sc.cues) {
    srt.push({ start: from / FPS + PAD_IN + c.start, end: from / FPS + PAD_IN + c.end, text: c.text });
  }
  from += sc.durationInFrames;
}
const srtText = srt.map((c, i) => `${i + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n`).join("\n");
writeFileSync(join(root, "public", "subtitles.srt"), srtText);
mkdirSync(join(root, "..", "out"), { recursive: true });
writeFileSync(join(root, "..", "out", "espeiria-lemonjuice-5min.it.srt"), srtText);
writeFileSync(join(root, "src", "data", "vo-timing.json"), JSON.stringify({ voice, rate, fps: FPS, padIn: PAD_IN, totalFrames: from, scenes }, null, 2));
console.log("totale video:", (from / FPS).toFixed(2), "s,", from, "frame");
console.log("totale voce:", scenes.reduce((a, s) => a + s.seconds, 0).toFixed(2), "s");
