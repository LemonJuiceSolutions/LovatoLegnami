import { interpolate } from "remotion";
import { EASE } from "../theme";

/** 0→1 con l'easing di brand tra start e start+dur (frame). */
export const ease = (frame: number, start: number, dur = 18) =>
  interpolate(frame, [start, start + dur], [0, 1], { easing: EASE, extrapolateLeft: "clamp", extrapolateRight: "clamp" });

/** dissolvenza d'entrata/uscita di una scena (10 frame). */
export const sceneFade = (frame: number, duration: number, len = 10) =>
  Math.min(
    interpolate(frame, [0, len], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(frame, [duration - len, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );
