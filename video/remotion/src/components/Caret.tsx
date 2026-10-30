import React from "react";
import { useCurrentFrame } from "remotion";
import { C } from "../theme";

/** caret lj-caret: visibile nella prima metà di ogni ciclo di ~1 s */
export const Caret: React.FC<{ height: number; color?: string; from?: number }> = ({ height, color = C.cyan, from = 0 }) => {
  const f = useCurrentFrame();
  const on = f >= from && (f - from) % 30 < 15;
  return <span style={{ display: "inline-block", width: Math.max(4, height * 0.07), height, background: color, opacity: on ? 1 : 0, marginLeft: height * 0.08, borderRadius: 2 }} />;
};
