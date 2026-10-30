import React from "react";
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, EASE, F, GRADIENT_ON_INK, type Layout } from "../theme";
import { ease } from "../components/anim";
import { EspeiriaWordmark } from "../components/EspeiriaWordmark";
import { Backdrop } from "../components/Backdrop";

/** Logo Lemonjuice + parola "Lemonjuice Solutions" (Solutions in accent-gradient). */
export const LemonjuiceLockup: React.FC<{ size: number; delay?: number; f: number }> = ({ size, delay = 0, f }) => {
  const logo = ease(f, delay, 20);
  const word = ease(f, delay + 8, 20);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.35 }}>
      <Img src={staticFile("assets/lemonjuice-logo.png")} style={{ width: size * 1.5, height: size * 1.5, opacity: logo, transform: `scale(${0.85 + 0.15 * logo}) rotate(${(1 - logo) * -12}deg)` }} />
      <div style={{ fontFamily: F.display, fontWeight: 800, fontSize: size, letterSpacing: "-0.035em", lineHeight: 1, opacity: word, transform: `translateX(${(1 - word) * 24}px)` }}>
        <span style={{ color: C.paper }}>Lemonjuice </span>
        <span style={{ backgroundImage: GRADIENT_ON_INK, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Solutions</span>
      </div>
    </div>
  );
};

/**
 * Scena 1 (tutta su fondo ink):
 *  A) Lemonjuice Solutions → "presenta"
 *  B) espeirIA (icona + parola) + tagline
 *  C) card "Progetto: Configuratore pergole" (logo Lemonjuice)
 */
export const Intro: React.FC<{ layout: Layout; duration: number; espFrame: number; projectFrame: number }> = ({ layout, duration, espFrame, projectFrame }) => {
  const f = useCurrentFrame();
  const v = layout === "9:16";
  const pres = ease(f, espFrame - 26, 14);
  const outA = interpolate(f, [espFrame - 6, espFrame + 8], [0, 1], { easing: EASE, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Backdrop seed={1} />
      {/* Fase A: Lemonjuice */}
      {f < espFrame + 10 ? (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 44, opacity: 1 - outA, transform: `translateY(${-outA * 40}px)` }}>
          <LemonjuiceLockup size={v ? 84 : 112} delay={4} f={f} />
          <div style={{ fontFamily: F.mono, fontSize: 28, letterSpacing: "0.36em", color: C.paper, opacity: pres, transform: `translateY(${(1 - pres) * 12}px)` }}>PRESENTA</div>
        </AbsoluteFill>
      ) : null}
      {/* Fasi B e C */}
      <Sequence from={espFrame} layout="none">
        <EspeiriaPhase layout={layout} projectAt={projectFrame - espFrame} />
      </Sequence>
    </AbsoluteFill>
  );
};

const EspeiriaPhase: React.FC<{ layout: Layout; projectAt: number }> = ({ layout, projectAt }) => {
  const f = useCurrentFrame();
  const v = layout === "9:16";
  const tag = ease(f, 26, 18);
  const by = ease(f, 36, 18);
  const lift = ease(f, projectAt - 4, 20);
  const card = ease(f, projectAt + 4, 20);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: v ? 44 : 36, padding: v ? "0 64px" : "0 96px", transform: `translateY(${-lift * (v ? 200 : 150)}px) scale(${1 - 0.18 * lift})` }}>
        <EspeiriaWordmark size={v ? 128 : 160} delay={4} caret={false} />
        <div style={{ fontFamily: F.body, fontWeight: 500, fontSize: v ? 42 : 40, color: C.mutedOnInk, opacity: tag, transform: `translateY(${(1 - tag) * 14}px)`, textAlign: "center", maxWidth: v ? 900 : 1400 }}>
          La piattaforma che porta la progettazione dal rilievo alla macchina
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, opacity: by * (1 - lift) }}>
          <span style={{ fontFamily: F.mono, fontSize: 20, letterSpacing: "0.22em", color: C.mutedOnInk }}>by LEMONJUICE SOLUTIONS</span>
          <Img src={staticFile("assets/lemonjuice-logo.png")} style={{ width: 34, height: 34 }} />
        </div>
      </AbsoluteFill>
      {/* Fase C: progetto */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: v ? 420 : 290, opacity: card, transform: `translateY(${(1 - card) * 40}px)` }}>
        <div style={{ display: "flex", flexDirection: v ? "column" : "row", alignItems: "center", gap: v ? 26 : 40, padding: v ? "30px 40px" : "26px 40px 26px 26px", borderRadius: 24, background: "rgba(255,255,255,0.06)", border: `1px solid ${C.lineOnInk}`, boxShadow: "0 30px 80px rgba(0,0,0,0.35)" }}>
          <div style={{ background: C.cream, borderRadius: 16, padding: "10px 18px", display: "flex", alignItems: "center", gap: 12 }}>
            <Img src={staticFile("assets/lemonjuice-logo.png")} style={{ width: v ? 76 : 64, height: v ? 76 : 64 }} />
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
              <span style={{ fontFamily: F.display, fontWeight: 800, fontSize: v ? 40 : 34, letterSpacing: "-0.03em", color: C.ink }}>Lemonjuice</span>
              <span style={{ fontFamily: F.mono, fontWeight: 700, fontSize: v ? 15 : 13, letterSpacing: "0.32em", color: C.purple, marginTop: 6 }}>SOLUTIONS</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: v ? "center" : "flex-start", textAlign: v ? "center" : "left" }}>
            <div style={{ fontFamily: F.mono, fontSize: 20, letterSpacing: "0.26em", color: C.mutedOnInk }}>PROGETTO</div>
            <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 46 : 44, color: C.paper, letterSpacing: "-0.02em" }}>Configuratore pergole</div>
            <div style={{ fontFamily: F.body, fontWeight: 500, fontSize: v ? 28 : 26, color: C.mutedOnInk }}>Preventivi, produzione e back-office</div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
