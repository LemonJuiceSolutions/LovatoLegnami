import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { C, F, type Layout } from "../theme";

export type Cue = { start: number; end: number; text: string };

/** Parser SRT minimale (hh:mm:ss,mmm). */
export const parseSrt = (srt: string): Cue[] => {
  const t = (s: string) => {
    const [h, m, rest] = s.trim().split(":");
    const [sec, ms] = rest.split(",");
    return Number(h) * 3600 + Number(m) * 60 + Number(sec) + Number(ms) / 1000;
  };
  return srt
    .replace(/\r/g, "")
    .split(/\n\n+/)
    .map((block) => block.split("\n").filter(Boolean))
    .filter((l) => l.length >= 3 && l[1].includes("-->"))
    .map((l) => {
      const [a, b] = l[1].split("-->");
      return { start: t(a), end: t(b), text: l.slice(2).join("\n") };
    });
};

/** Sottotitoli impressi: DM Sans 600, bianco su pill ink 85%, max 2 righe. */
export const Subtitles: React.FC<{ cues: Cue[]; layout: Layout }> = ({ cues, layout }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = f / fps;
  const cue = cues.find((c) => now >= c.start && now < c.end + 0.12);
  if (!cue) return null;
  const v = layout === "9:16";
  const size = v ? 52 : 44;
  const fadeIn = Math.min(1, (now - cue.start) / 0.12);
  return (
    <div
      style={{
        position: "absolute", left: 0, right: 0, bottom: v ? 250 : 58, display: "flex", justifyContent: "center", pointerEvents: "none",
        padding: v ? "0 64px" : "0 96px",
      }}
    >
      <div
        style={{
          fontFamily: F.body, fontWeight: 600, fontSize: size, lineHeight: 1.22, color: C.paper, textAlign: "center",
          background: "rgba(11,12,20,0.85)", borderRadius: v ? 28 : 22, padding: v ? "16px 30px" : "12px 28px", whiteSpace: "pre-line",
          opacity: fadeIn, maxWidth: v ? 952 : 1300, boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
        }}
      >
        {cue.text}
      </div>
    </div>
  );
};
