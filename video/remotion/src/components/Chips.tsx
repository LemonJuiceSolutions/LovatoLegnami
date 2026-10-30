import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C, F, GRADIENT } from "../theme";
import type { Chip } from "../data/scenes";
import { ease } from "./anim";

const toneStyle = (tone: Chip["tone"]): React.CSSProperties => {
  switch (tone) {
    case "success": return { background: "rgba(15,157,107,0.16)", color: "#4FE0A8", border: "1px solid rgba(79,224,168,0.45)" };
    case "danger": return { background: "rgba(228,0,20,0.16)", color: "#FF7A85", border: "1px solid rgba(255,122,133,0.5)" };
    case "mono": return { fontFamily: F.mono, fontWeight: 500, letterSpacing: "0.02em", background: C.ink2, color: C.paper, border: `1px solid ${C.lineOnInk}` };
    case "counter": return { fontFamily: F.mono, fontWeight: 700, letterSpacing: "0.18em", background: C.ink2, color: C.cyan, border: "1px solid rgba(0,184,224,0.45)" };
    case "gradient": return { backgroundImage: GRADIENT, color: C.paper, border: "1px solid transparent" };
    default: return { background: "rgba(255,255,255,0.06)", color: C.paper, border: "1px solid rgba(255,255,255,0.18)" };
  }
};

/** Pill che compaiono in sequenza tra startFrame e endFrame. I "counter" contano da 0. */
export const Chips: React.FC<{ chips: Chip[]; startFrame: number; endFrame: number; size: number; align?: "left" | "center" }> = ({
  chips, startFrame, endFrame, size, align = "left",
}) => {
  const f = useCurrentFrame();
  const step = chips.length > 1 ? (endFrame - startFrame) / (chips.length - 1) : 0;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: size * 0.5, alignItems: "center", justifyContent: align === "center" ? "center" : "flex-start" }}>
      {chips.map((c, i) => {
        const at = startFrame + i * step;
        const p = ease(f, at, 14);
        let label = c.label;
        if (c.tone === "counter") {
          const m = label.match(/^(\d+)(.*)$/);
          if (m) {
            const n = Math.round(interpolate(f, [at, at + 24], [0, Number(m[1])], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
            label = String(n).padStart(2, "0") + m[2];
          }
        }
        return (
          <React.Fragment key={i}>
            <div
              style={{
                fontFamily: F.body, fontWeight: 600, fontSize: size, padding: `${size * 0.42}px ${size * 0.8}px`, borderRadius: 999,
                opacity: p, transform: `translateY(${(1 - p) * 14}px) scale(${0.94 + 0.06 * p})`, whiteSpace: "nowrap",
                ...toneStyle(c.tone),
              }}
            >
              {label}
            </div>
            {c.arrow ? <span style={{ fontFamily: F.mono, color: C.mutedOnInk, fontSize: size, opacity: ease(f, at + 6, 10) }}>→</span> : null}
          </React.Fragment>
        );
      })}
    </div>
  );
};
