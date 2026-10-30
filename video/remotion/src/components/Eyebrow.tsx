import React from "react";
import { useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { ease } from "./anim";

export const Eyebrow: React.FC<{ step?: string; label?: string; delay?: number; size?: number; onLight?: boolean }> = ({
  step, label, delay = 0, size = 22, onLight,
}) => {
  const f = useCurrentFrame();
  const p = ease(f, delay, 16);
  return (
    <div
      style={{
        fontFamily: F.mono, fontSize: size, fontWeight: 500, letterSpacing: "0.22em", textTransform: "uppercase",
        color: onLight ? C.mutedOnCream : C.mutedOnInk, opacity: p, transform: `translateY(${(1 - p) * 10}px)`,
        display: "flex", alignItems: "center", gap: size * 0.7, whiteSpace: "nowrap",
      }}
    >
      {step ? <span style={{ color: onLight ? C.ink : C.cyan, fontWeight: 700 }}>{step}</span> : null}
      {step && label ? <span style={{ opacity: 0.6 }}>·</span> : null}
      {label ? <span>{label}</span> : null}
    </div>
  );
};
