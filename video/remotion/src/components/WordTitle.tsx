import React from "react";
import { useCurrentFrame } from "remotion";
import { C, F, GRADIENT, GRADIENT_ON_INK } from "../theme";
import { ease } from "./anim";

/** Titolo parola per parola (stagger ~50 ms = 1.5 frame), una parola con accent-gradient. */
export const WordTitle: React.FC<{
  text: string; highlight?: string; delay?: number; size: number; onLight?: boolean; align?: "left" | "center"; stagger?: number;
}> = ({ text, highlight, delay = 0, size, onLight, align = "left", stagger = 1.6 }) => {
  const f = useCurrentFrame();
  const words = text.split(" ");
  return (
    <div
      style={{
        fontFamily: F.display, fontWeight: 700, fontSize: size, lineHeight: 1.04, letterSpacing: "-0.03em",
        color: onLight ? C.ink : C.paper, textAlign: align, display: "flex", flexWrap: "wrap",
        justifyContent: align === "center" ? "center" : "flex-start", columnGap: size * 0.26, rowGap: size * 0.04,
      }}
    >
      {words.map((w, i) => {
        const p = ease(f, delay + i * stagger, 18);
        const hl = highlight && w === highlight;
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", paddingBottom: size * 0.12, marginBottom: -size * 0.12 }}>
            <span
              style={{
                display: "inline-block", opacity: p, transform: `translateY(${(1 - p) * size * 0.32}px)`,
                ...(hl
                  ? { backgroundImage: onLight ? GRADIENT : GRADIENT_ON_INK, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }
                  : {}),
              }}
            >
              {w}
            </span>
          </span>
        );
      })}
    </div>
  );
};
