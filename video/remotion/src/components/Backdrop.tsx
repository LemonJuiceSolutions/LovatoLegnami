import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C } from "../theme";

/** Fondo ink con "orb" sfocati di brand che respirano lentamente. */
export const Backdrop: React.FC<{ seed?: number }> = ({ seed = 0 }) => {
  const f = useCurrentFrame() + seed * 97;
  const orb = (x: number, y: number, r: number, color: string, k: number) => (
    <div
      style={{
        position: "absolute", left: `${x + Math.sin(f / (90 + k * 13)) * 3}%`, top: `${y + Math.cos(f / (110 + k * 7)) * 3}%`,
        width: r, height: r, borderRadius: "50%", background: color, filter: "blur(140px)", opacity: 0.32, transform: "translate(-50%,-50%)",
      }}
    />
  );
  return (
    <AbsoluteFill style={{ background: C.ink, overflow: "hidden" }}>
      {orb(12, 18, 640, "#0096C9", 1)}
      {orb(88, 30, 560, "#6E2BD0", 2)}
      {orb(70, 95, 620, "#C230D6", 3)}
      {/* griglia tecnica leggerissima */}
      <AbsoluteFill
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "64px 64px", maskImage: "radial-gradient(ellipse at center, black 30%, transparent 80%)",
        }}
      />
    </AbsoluteFill>
  );
};
