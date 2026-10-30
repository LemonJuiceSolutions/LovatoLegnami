import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, F, GRADIENT_ON_INK, type Layout } from "../theme";
import type { ChapterDef } from "../data/scenes";
import { Backdrop } from "../components/Backdrop";
import { WordTitle } from "../components/WordTitle";
import { ease } from "../components/anim";

const CHAPTERS = [
  { letter: "A", name: "Lato sito" },
  { letter: "B", name: "Lato configuratore" },
  { letter: "C", name: "Back-office" },
];

/** Card di capitolo: lettera in accent-gradient, titolo parola per parola, sottotitolo e i tre capitoli come pill. */
export const Chapter: React.FC<{ def: ChapterDef; layout: Layout; seed?: number }> = ({ def, layout, seed = 0 }) => {
  const f = useCurrentFrame();
  const v = layout === "9:16";
  const letterP = ease(f, 0, 20);
  const subP = ease(f, 18, 16);
  const pillsP = ease(f, 10, 18);
  return (
    <AbsoluteFill>
      <Backdrop seed={seed} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: v ? 40 : 34, padding: v ? "0 64px" : "0 160px" }}>
        <div style={{ fontFamily: F.mono, fontSize: v ? 26 : 24, letterSpacing: "0.22em", color: C.mutedOnInk, opacity: letterP }}>
          CAPITOLO <span style={{ color: C.cyan, fontWeight: 700 }}>{def.letter}</span>
        </div>
        <div style={{
          fontFamily: F.display, fontWeight: 800, fontSize: v ? 220 : 200, lineHeight: 0.9, letterSpacing: "-0.04em",
          backgroundImage: GRADIENT_ON_INK, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
          opacity: letterP, transform: `translateY(${(1 - letterP) * 30}px) scale(${0.9 + 0.1 * letterP})`,
        }}>{def.letter}</div>
        <WordTitle text={def.title} highlight={def.highlight} size={v ? 104 : 112} delay={6} align="center" stagger={2} />
        <div style={{ fontFamily: F.body, fontWeight: 500, fontSize: v ? 40 : 36, color: C.mutedOnInk, opacity: subP, transform: `translateY(${(1 - subP) * 12}px)`, textAlign: "center" }}>
          {def.subtitle}
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 18, opacity: pillsP, flexWrap: "wrap", justifyContent: "center" }}>
          {CHAPTERS.map((c) => {
            const on = c.letter === def.letter;
            return (
              <div key={c.letter} style={{
                fontFamily: F.mono, fontSize: v ? 22 : 20, letterSpacing: "0.14em", padding: "10px 20px", borderRadius: 999,
                color: on ? C.paper : C.mutedOnInk, border: on ? "1px solid rgba(56,214,255,0.6)" : `1px solid ${C.lineOnInk}`,
                background: on ? "rgba(56,214,255,0.12)" : "transparent",
              }}>{c.letter} · {c.name.toUpperCase()}</div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
