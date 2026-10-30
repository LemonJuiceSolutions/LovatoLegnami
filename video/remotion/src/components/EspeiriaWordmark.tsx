import React from "react";
import { Img, staticFile, useCurrentFrame } from "remotion";
import { C, F, GRADIENT_ON_INK } from "../theme";
import { ease } from "./anim";
import { Caret } from "./Caret";

/** Icona + parola "espeirIA" (Bricolage 800, "IA" in accent-gradient). Lettere che salgono una per una (stagger 2 frame). */
export const EspeiriaWordmark: React.FC<{ size: number; delay?: number; caret?: boolean; iconScale?: number }> = ({
  size, delay = 0, caret = true, iconScale = 1.15,
}) => {
  const f = useCurrentFrame();
  const letters = "espeirIA".split("");
  const icon = ease(f, delay, 20);
  const iconPx = size * iconScale;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.28 }}>
      <div
        style={{
          width: iconPx, height: iconPx, borderRadius: iconPx * 0.22, overflow: "hidden", opacity: icon,
          transform: `scale(${0.8 + 0.2 * icon})`, boxShadow: `0 0 ${size * 0.8}px rgba(0,212,255,${0.35 * icon}), inset 0 0 0 1px rgba(255,255,255,0.12)`,
        }}
      >
        <Img src={staticFile("assets/espeiria-icon-512.png")} style={{ width: "100%", height: "100%" }} />
      </div>
      <div style={{ fontFamily: F.display, fontWeight: 800, fontSize: size, letterSpacing: "-0.035em", lineHeight: 1, display: "flex", alignItems: "center" }}>
        {letters.map((l, i) => {
          const p = ease(f, delay + 6 + i * 2, 16);
          const ia = i >= 6;
          return (
            <span key={i} style={{ display: "inline-block", overflow: "hidden", paddingBottom: size * 0.14, marginBottom: -size * 0.14 }}>
              <span
                style={{
                  display: "inline-block", transform: `translateY(${(1 - p) * size * 0.9}px)`, opacity: p,
                  color: ia ? "transparent" : C.paper,
                  ...(ia ? { backgroundImage: GRADIENT_ON_INK, backgroundSize: "200% 100%", backgroundPosition: i === 6 ? "0% 0" : "100% 0", WebkitBackgroundClip: "text", backgroundClip: "text" } : {}),
                }}
              >
                {l}
              </span>
            </span>
          );
        })}
        {caret ? <Caret height={size * 0.82} from={delay + 6 + letters.length * 2 + 10} /> : null}
      </div>
    </div>
  );
};
