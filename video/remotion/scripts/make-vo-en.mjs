// Versione INGLESE: voce inglese (macOS `say`) frase per frase, sottotitoli ITALIANI allineati alle frasi.
// Scrive:
//   public/vo-en/scene-XX.wav          (frasi concatenate con pause fisse)
//   src/data/vo-timing.en.json         (timeline della versione inglese + ganci per intro/outro)
//   public/subtitles.en-it.srt e ../out/espeiria-lemonjuice-5min-EN.it.srt
// Uso: node scripts/make-vo-en.mjs [--voice Daniel] [--rate 165]
// La versione italiana (make-vo.mjs, vo-timing.json, subtitles.srt) non viene toccata.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { VO, FPS, PAD_IN, PAD_OUT } from "../src/data/vo-text.mjs";
import { VO_EN, HOOKS_EN, screenText, ttsText } from "../src/data/vo-text.en.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const voDir = join(root, "public", "vo-en");
const tmp = join(voDir, "_lines");
mkdirSync(tmp, { recursive: true });
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const voice = arg("voice", "en-US-AvaMultilingualNeural");
const EDGE = join(root, "..", "..", "..", "tts-venv", "bin", "edge-tts");
const rate = arg("rate", "+0%");
const SR = 48000;
const GAP = 0.42, GAP_COLON = 0.22; // pausa tra frasi (dopo ":" più corta)

const itTiming = JSON.parse(readFileSync(join(root, "src", "data", "vo-timing.json"), "utf8"));
const recs = JSON.parse(readFileSync(join(root, "src", "data", "recordings.json"), "utf8"));

// --- sottotitoli: stessa logica della versione italiana (max 2 righe x 42) ---
function chunk(text, max = 42 * 2 - 4) {
  if (text.length <= max) return [text];
  const parts = text.match(/[^.:;!?]+[.:;!?»]*/g).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const s of parts) {
    if (s.length <= max) { out.push(s); continue; }
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
  const merged = [];
  for (const c of out) {
    const last = merged[merged.length - 1];
    if (last && (last.length < 22 || c.length < 16) && (last + " " + c).length <= max) merged[merged.length - 1] = last + " " + c;
    else merged.push(c);
  }
  return merged;
}
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

// --- audio di una frase: say -> pcm 48k mono, silenzi iniziale/finale rimossi ---
function lineAudio(name, text) {
  const aiff = join(tmp, `${name}.mp3`), raw = join(tmp, `${name}.raw`);
  // voce neurale Microsoft (edge-tts, nessuna chiave)
  for (let k = 1; ; k++) {
    try { execFileSync(EDGE, ["--voice", voice, "--rate", rate, "--text", ttsText(text), "--write-media", aiff], { stdio: "pipe" }); break; }
    catch (e) { if (k >= 5) throw e; execFileSync("sleep", [String(2 * k)]); }
  }
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", aiff, "-af",
    "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.06,areverse,acompressor=threshold=-22dB:ratio=2.5:attack=8:release=120:makeup=2,volume=2.5dB,alimiter=limit=0.89:attack=4:release=60:level=disabled",
    "-ar", String(SR), "-ac", "1", "-f", "s16le", raw]);
  return readFileSync(raw);
}
function wavHeader(bytes) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + bytes, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(bytes, 40);
  return h;
}
const silence = (sec) => Buffer.alloc(Math.round(sec * SR) * 2);

const scenes = [];
let from = 0;
const srt = [];
for (const s of VO_EN) {
  const it = VO.find((v) => v.id === s.id);
  const itT = itTiming.scenes.find((v) => v.id === s.id);
  const bufs = [];
  let t = 0;
  const lines = [];
  s.lines.forEach(([en, itText], i) => {
    const pcm = lineAudio(`${s.id}-${i}`, en);
    const d = pcm.length / 2 / SR;
    bufs.push(pcm);
    lines.push({ start: t, end: t + d, en: screenText(en), it: itText });
    t += d;
    if (i < s.lines.length - 1) {
      const g = /:$/.test(en.trim()) ? GAP_COLON : GAP;
      bufs.push(silence(g));
      t += g;
    }
  });
  const pcm = Buffer.concat(bufs);
  writeFileSync(join(voDir, `scene-${s.id}.wav`), Buffer.concat([wavHeader(pcm.length), pcm]));
  const seconds = pcm.length / 2 / SR;

  // cue italiani: uno per frase inglese, diviso se lungo; restano a schermo durante la pausa successiva
  const cues = [];
  lines.forEach((ln, i) => {
    const end = i < lines.length - 1 ? lines[i + 1].start : ln.end;
    const parts = chunk(ln.it);
    const w = (c) => c.length + (c.match(/[,.:;]/g) || []).length * 4;
    const tot = parts.reduce((a, c) => a + w(c), 0);
    let ct = ln.start;
    parts.forEach((c, k) => {
      const d = (w(c) / tot) * (ln.end - ln.start);
      cues.push({ start: ct, end: k === parts.length - 1 ? end : ct + d, text: wrap(c) });
      ct += d;
    });
  });

  // ganci delle animazioni (s, relativi all'inizio voce), posizione proporzionale ai caratteri nella frase inglese
  const hooks = {};
  for (const [k, needle] of Object.entries(HOOKS_EN[s.id] || {})) {
    const ln = lines.find((l) => l.en.includes(needle));
    if (ln) hooks[k] = ln.start + ((ln.end - ln.start) * ln.en.indexOf(needle)) / ln.en.length;
  }

  // durata scena: voce + pad, mai sotto il minimo; tenuta vicina alla durata italiana (ritmo e clip),
  // ma mai oltre il limite della registrazione (playbackRate >= 0.75 non deve chiedere oltre la fine).
  const voiceBased = Math.max(it.minSeconds, PAD_IN + seconds + PAD_OUT + (it.extra || 0));
  const itSec = itT.durationInFrames / FPS;
  const recKey = Object.keys(recs).find((k) => k.startsWith(`s${s.id}-`));
  const recLimit = recKey ? recs[recKey] / 0.75 - 0.2 - 0.15 : Infinity;
  let target = Math.max(voiceBased, Math.min(itSec - 0.8, recLimit));
  if (target > recLimit) console.warn(`!! scena ${s.id}: ${target.toFixed(2)} s oltre il limite clip ${recLimit.toFixed(2)} s`);
  const durationInFrames = Math.ceil(target * FPS);
  const voiceStartFrame = Math.round(PAD_IN * FPS);
  for (const c of cues) srt.push({ start: from / FPS + PAD_IN + c.start, end: from / FPS + PAD_IN + c.end, text: c.text });
  scenes.push({ id: s.id, file: `vo-en/scene-${s.id}.wav`, seconds, cues, lines, hooks, from, durationInFrames, voiceStartFrame });
  console.log(`scene-${s.id}: voce ${seconds.toFixed(2)} s, scena ${(durationInFrames / FPS).toFixed(2)} s (IT ${itSec.toFixed(2)}), ${cues.length} cue${recKey ? `, clip ${recs[recKey].toFixed(1)} s, rate ${(recs[recKey] / (durationInFrames / FPS + 0.2)).toFixed(2)}` : ""}`);
  from += durationInFrames;
}
rmSync(tmp, { recursive: true, force: true });

const fmt = (sec) => {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};
const srtText = srt.map((c, i) => `${i + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n`).join("\n");
writeFileSync(join(root, "public", "subtitles.en-it.srt"), srtText);
mkdirSync(join(root, "..", "out"), { recursive: true });
writeFileSync(join(root, "..", "out", "espeiria-lemonjuice-5min-EN.it.srt"), srtText);
writeFileSync(join(root, "src", "data", "vo-timing.en.json"), JSON.stringify({ voice, rate, fps: FPS, padIn: PAD_IN, totalFrames: from, scenes }, null, 2));
console.log("totale video:", (from / FPS).toFixed(2), "s,", from, "frame (IT", (itTiming.totalFrames / FPS).toFixed(2), "s)");
console.log("totale voce:", scenes.reduce((a, s) => a + s.seconds, 0).toFixed(2), "s, cue:", srt.length);
