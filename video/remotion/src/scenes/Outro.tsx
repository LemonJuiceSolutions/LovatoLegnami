import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, F, GRADIENT, GRADIENT_ON_INK, type Layout } from "../theme";
import { ease } from "../components/anim";
import { Backdrop } from "../components/Backdrop";
import { Eyebrow } from "../components/Eyebrow";
import { WordTitle } from "../components/WordTitle";
import { EspeiriaWordmark } from "../components/EspeiriaWordmark";
import { Marquee } from "../components/Marquee";
import { TIPOLOGIE } from "../data/scenes";

/** Scena 9: titolo di chiusura → lockup espeirIA × Lemonjuice Solutions, URL, CTA; marquee che si ferma; fade a nero. */
export const Outro: React.FC<{ layout: Layout; duration: number; lockupFrame: number; step: string; bgSrc: string | null }> = ({
  layout, duration, lockupFrame, step, bgSrc,
}) => {
  const f = useCurrentFrame();
  const v = layout === "9:16";
  const out = ease(f, lockupFrame - 6, 14);
  const lock = ease(f, lockupFrame, 22);
  const meta = ease(f, lockupFrame + 16, 18);
  const cta = ease(f, lockupFrame + 26, 18);
  const black = interpolate(f, [duration - 12, duration], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Backdrop seed={4} />
      {bgSrc ? (
        <AbsoluteFill style={{ opacity: 0.35, filter: "blur(18px)", transform: "scale(1.1)" }}>
          <OffthreadVideo src={staticFile(bgSrc)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </AbsoluteFill>
      ) : null}

      {/* Fase A: titolo */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 36, padding: v ? "0 64px" : "0 160px", opacity: 1 - out, transform: `translateY(${-out * 40}px)` }}>
        <Eyebrow step={step} size={v ? 26 : 24} />
        <WordTitle text="Dal rilievo alla macchina. Una sola configurazione." highlight="macchina." size={v ? 104 : 116} delay={4} align="center" stagger={2} />
      </AbsoluteFill>

      {/* Fase B: lockup */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: v ? 56 : 52, opacity: lock, transform: `translateY(${(1 - lock) * 30}px)`, paddingBottom: v ? 120 : 60 }}>
        {f >= lockupFrame - 2 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: v ? 26 : 22 }}>
            <EspeiriaWordmark size={v ? 128 : 136} delay={lockupFrame} caret={false} />
            <div style={{ display: "flex", alignItems: "center", gap: 14, opacity: ease(f, lockupFrame + 10, 18) }}>
              <span style={{ fontFamily: F.mono, fontSize: v ? 24 : 24, letterSpacing: "0.24em", color: C.mutedOnInk }}>by</span>
              <Img src={staticFile("assets/lemonjuice-logo.png")} style={{ width: 54, height: 54 }} />
              <span style={{ fontFamily: F.display, fontWeight: 800, fontSize: v ? 40 : 40, letterSpacing: "-0.02em", color: C.paper }}>Lemonjuice <span style={{ backgroundImage: GRADIENT_ON_INK, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Solutions</span></span>
            </div>
          </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 18, opacity: meta, flexDirection: v ? "column" : "row" }}>
          <span style={{ fontFamily: F.body, fontWeight: 500, fontSize: v ? 28 : 26, color: C.mutedOnInk }}>Progetto realizzato da</span>
          <div style={{ background: C.cream, borderRadius: 12, padding: "8px 14px", display: "flex", alignItems: "center", gap: 10 }}>
            <Img src={staticFile("assets/lemonjuice-logo.png")} style={{ width: 40, height: 40 }} />
            <span style={{ fontFamily: F.display, fontWeight: 800, fontSize: v ? 30 : 26, letterSpacing: "-0.02em", color: C.ink }}>Lemonjuice <span style={{ color: C.purple }}>Solutions</span></span>
          </div>
        </div>
        <div style={{ fontFamily: F.body, fontWeight: 700, fontSize: v ? 40 : 36, color: C.paper, backgroundImage: GRADIENT, padding: v ? "22px 52px" : "18px 46px", borderRadius: 999, opacity: cta, transform: `scale(${0.92 + 0.08 * cta})`, boxShadow: "0 18px 50px rgba(110,43,208,0.45)" }}>
          Parliamone →
        </div>
        <div style={{ fontFamily: F.mono, fontSize: 24, letterSpacing: "0.12em", color: C.mutedOnInk, opacity: cta, marginTop: -18 }}>lemonjuicesolutions.it</div>
      </AbsoluteFill>

      <div style={{ position: "absolute", left: 0, right: 0, bottom: v ? 160 : 16 }}>
        <Marquee items={TIPOLOGIE} size={22} color="rgba(255,255,255,0.4)" slowFrom={Math.max(0, duration - 90)} stopAfter={60} />
      </div>
      <AbsoluteFill style={{ background: "#000", opacity: black }} />
    </AbsoluteFill>
  );
};
