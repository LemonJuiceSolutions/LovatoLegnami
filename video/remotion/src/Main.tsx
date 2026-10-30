import React, { useMemo } from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { C, type Layout } from "./theme";
import { SCENES, timingOf, totalFramesFor, type Lang, type SceneTiming } from "./data/scenes";
import { Intro } from "./scenes/Intro";
import { ScreenScene } from "./scenes/ScreenScene";
import { Outro } from "./scenes/Outro";
import { Chapter } from "./scenes/Chapter";
import recDurations from "./data/recordings.json";
import { Subtitles, type Cue } from "./components/Subtitles";
import { sceneFade } from "./components/anim";

export type MainProps = {
  layout: Layout;
  /** file presenti in public/recordings (calcolati in calculateMetadata) */
  recordings: string[];
  /** sottotitoli letti da public/subtitles.srt */
  cues: Cue[];
  /** lingua della voce: "it" (default) o "en" (voce inglese, sottotitoli italiani, musica) */
  lang?: Lang;
};

const findRecording = (recordings: string[], name: string) =>
  ["mp4", "webm", "mov"].map((ext) => `recordings/${name}.${ext}`).find((p) => recordings.includes(p)) ?? null;

/** frame (relativo alla scena) in cui inizia il cue che contiene `needle`. */
const cueFrame = (t: SceneTiming, needle: string, fallbackRatio: number) => {
  const c = t.cues.find((x) => x.text.replace(/\n/g, " ").includes(needle));
  if (!c) return Math.round(t.durationInFrames * fallbackRatio);
  // posizione della parola dentro il cue, in proporzione ai caratteri
  const txt = c.text.replace(/\n/g, " ");
  const at = c.start + ((c.end - c.start) * txt.indexOf(needle)) / txt.length;
  return t.voiceStartFrame + Math.round(at * 30);
};

/** frame del gancio: nella versione inglese arriva già calcolato da make-vo-en (t.hooks), altrimenti dai cue. */
const hookFrame = (t: SceneTiming, key: string, needle: string, fallbackRatio: number) =>
  t.hooks && t.hooks[key] != null ? t.voiceStartFrame + Math.round(t.hooks[key] * 30) : cueFrame(t, needle, fallbackRatio);

// --- musica (solo versione inglese): letto ducking sotto la voce ---
const MUSIC_SRC = "music/sunset_plains.wav"; // "Sunset Plains" di Yoiyami, CC0 (vedi ../music/LICENSE.md)
const DB = (d: number) => Math.pow(10, d / 20);
const MUSIC_DUCK = -21; // dB sotto la voce nelle scene schermo (musica -16 LUFS, voce -17 LUFS: circa -20 dB di distacco)
const MUSIC_DUCK_CARD = -18; // sotto la voce in intro, capitoli e outro: il letto resta più presente
const MUSIC_GAP = -12; // pause lunghe nelle scene schermo
const MUSIC_OPEN = -3; // intro, card di capitolo, outro, quando la voce tace

const useMusicEnvelope = (lang: Lang) =>
  useMemo(() => {
    const total = totalFramesFor(lang);
    const target = new Float32Array(total);
    const duck = new Float32Array(total);
    const voice = new Uint8Array(total);
    for (const def of SCENES) {
      const t = timingOf(def.id, lang);
      const open = def.kind === "screen" ? MUSIC_GAP : MUSIC_OPEN;
      const d = def.kind === "screen" ? MUSIC_DUCK : MUSIC_DUCK_CARD;
      for (let f = t.from; f < t.from + t.durationInFrames && f < total; f++) { target[f] = open; duck[f] = d; }
      const spans = (t.lines ?? t.cues).map((l) => [l.start, l.end]);
      // le pause brevi tra le frasi restano sotto: il letto non "pompa"
      const merged: number[][] = [];
      for (const [a, b] of spans) {
        const last = merged[merged.length - 1];
        if (last && a - last[1] < 1.4) last[1] = b;
        else merged.push([a, b]);
      }
      for (const [a, b] of merged) {
        const fa = t.from + t.voiceStartFrame + Math.floor((a - 0.35) * 30);
        const fb = t.from + t.voiceStartFrame + Math.ceil((b + 0.3) * 30);
        for (let f = Math.max(0, fa); f < Math.min(total, fb); f++) voice[f] = 1;
      }
    }
    const env = new Float32Array(total);
    let cur = MUSIC_OPEN;
    for (let f = 0; f < total; f++) {
      const want = voice[f] ? duck[f] : target[f];
      // discesa rapida (~0.3 s), risalita morbida (~1.2 s; più svelta sulle card)
      const k = want < cur ? 0.16 : target[f] === MUSIC_OPEN ? 0.07 : 0.04;
      cur += (want - cur) * k;
      const fadeIn = Math.min(1, f / 45);
      const fadeOut = Math.min(1, (total - 1 - f) / 90);
      env[f] = DB(cur) * fadeIn * Math.max(0, fadeOut);
    }
    return env;
  }, [lang]);

const Music: React.FC<{ lang: Lang }> = ({ lang }) => {
  const env = useMusicEnvelope(lang);
  return <Audio src={staticFile(MUSIC_SRC)} volume={(f) => env[Math.max(0, Math.min(env.length - 1, f))]} />;
};

const Fade: React.FC<{ duration: number; children: React.ReactNode; fadeIn?: boolean }> = ({ duration, children, fadeIn = true }) => {
  const f = useCurrentFrame();
  const o = fadeIn ? sceneFade(f, duration, 8) : Math.min(1, sceneFade(f + 8, duration + 8, 8));
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

export const Main: React.FC<MainProps> = ({ layout, recordings, cues, lang = "it" }) => {
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      {SCENES.map((def, i) => {
        const t = timingOf(def.id, lang);
        let node: React.ReactNode;
        if (def.kind === "intro") {
          node = <Intro layout={layout} duration={t.durationInFrames} espFrame={hookFrame(t, "esp", "espeirIA", 0.3)} projectFrame={hookFrame(t, "project", "Il primo progetto", 0.6)} />;
        } else if (def.kind === "outro") {
          node = (
            <Outro layout={layout} duration={t.durationInFrames} step={def.step} lockupFrame={hookFrame(t, "lockup", "espeirIA, by", 0.45)}
              bgSrc={null} />
          );
        } else if (def.kind === "chapter") {
          node = <Chapter def={def} layout={layout} seed={i} />;
        } else {
          // la registrazione viene accelerata/rallentata per durare quanto la scena
          const rec = (recDurations as Record<string, number>)[def.recording] ?? 0;
          const usable = t.durationInFrames / 30 + 0.2; // il tempo richiesto resta sempre dentro la clip
          const rate = rec ? Math.min(2.4, Math.max(0.75, rec / usable)) : 1;
          node = <ScreenScene def={def} layout={layout} duration={t.durationInFrames} recordingSrc={findRecording(recordings, def.recording)} seed={i} playbackRate={rate} />;
        }
        return (
          <Sequence key={def.id} name={`${def.id} ${def.label}`} from={t.from} durationInFrames={t.durationInFrames}>
            <Fade duration={t.durationInFrames} fadeIn={i > 0}>{node}</Fade>
            <Sequence from={t.voiceStartFrame} name={`voce ${def.id}`}>
              <Audio src={staticFile(t.file)} />
            </Sequence>
          </Sequence>
        );
      })}
      {lang === "en" ? <Music lang={lang} /> : null}
      <Subtitles cues={cues} layout={layout} />
    </AbsoluteFill>
  );
};
