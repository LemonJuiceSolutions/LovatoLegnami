import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { F } from "../theme";

/** Marquee orizzontale (lj-marquee). slowFrom: da questo frame rallenta fino a fermarsi in `stopAfter` frame. */
export const Marquee: React.FC<{ items: string[]; size: number; color: string; speed?: number; slowFrom?: number; stopAfter?: number }> = ({
  items, size, color, speed = 2.2, slowFrom, stopAfter = 60,
}) => {
  const f = useCurrentFrame();
  const { width } = useVideoConfig();
  // distanza percorsa: integrale della velocità (costante, poi rampa lineare a zero)
  let dist = f * speed;
  if (slowFrom !== undefined && f > slowFrom) {
    const t = Math.min(f - slowFrom, stopAfter);
    dist = slowFrom * speed + speed * (t - (t * t) / (2 * stopAfter));
  }
  const row = items.join("   ·   ") + "   ·   ";
  const approxRowWidth = row.length * size * 0.62;
  const reps = Math.ceil((width * 2) / approxRowWidth) + 1;
  const x = -(dist % approxRowWidth);
  return (
    <div style={{ overflow: "hidden", width: "100%", whiteSpace: "nowrap", fontFamily: F.mono, fontSize: size, letterSpacing: "0.08em", color, textTransform: "uppercase" }}>
      <div style={{ transform: `translateX(${x}px)`, display: "inline-block" }}>
        {Array.from({ length: reps }).map((_, i) => (
          <span key={i} style={{ display: "inline-block", width: approxRowWidth }}>{row}</span>
        ))}
      </div>
    </div>
  );
};
