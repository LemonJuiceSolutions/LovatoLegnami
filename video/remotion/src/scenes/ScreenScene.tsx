import React from "react";
import { AbsoluteFill } from "remotion";
import { C, type Layout } from "../theme";
import type { ScreenDef } from "../data/scenes";
import { Backdrop } from "../components/Backdrop";
import { Eyebrow } from "../components/Eyebrow";
import { WordTitle } from "../components/WordTitle";
import { Chips } from "../components/Chips";
import { ScreenFrame } from "../components/ScreenFrame";
import { Marquee } from "../components/Marquee";

/**
 * Scena "schermo": eyebrow numerato (passo · capitolo), titolo parola per parola, pill in sequenza
 * e la registrazione reale (public/recordings/<nome>.mp4) in una cornice browser o telefono.
 */
export const ScreenScene: React.FC<{
  def: ScreenDef; layout: Layout; duration: number; recordingSrc: string | null; seed?: number; playbackRate?: number;
}> = ({ def, layout, duration, recordingSrc, seed = 0, playbackRate = 1 }) => {
  const v = layout === "9:16";
  const device = def.device ?? "browser";
  const phone = device === "phone";
  const chipsStart = Math.round(duration * 0.2);
  const chipsEnd = Math.round(duration * 0.72);
  const frameProps = {
    device, src: recordingSrc, recordingFile: `${def.recording}.mp4`, title: def.label, url: def.url, duration, playbackRate,
  } as const;

  if (v) {
    const fw = phone ? 400 : 952;
    const fh = phone ? 844 : 567;
    return (
      <AbsoluteFill>
        <Backdrop seed={seed} />
        <AbsoluteFill style={{ padding: "200px 64px 0", display: "flex", flexDirection: "column", gap: 30 }}>
          <Eyebrow step={def.step} label={def.chapter} size={24} />
          <WordTitle text={def.title} highlight={def.highlight} size={phone ? 72 : 80} delay={4} />
          <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}>
            <ScreenFrame width={fw} height={fh} {...frameProps} delay={10} />
          </div>
          <Chips chips={def.chips} startFrame={chipsStart} endFrame={chipsEnd} size={def.chips.length > 6 ? 24 : 28} align="center" />
        </AbsoluteFill>
        {def.marquee && !phone ? (
          <div style={{ position: "absolute", left: 0, right: 0, top: 130 }}>
            <Marquee items={def.marquee} size={24} color={C.mutedOnInk} />
          </div>
        ) : null}
      </AbsoluteFill>
    );
  }

  if (phone) {
    return (
      <AbsoluteFill>
        <Backdrop seed={seed} />
        <div style={{ position: "absolute", left: 120, top: 150, width: 900, display: "flex", flexDirection: "column", gap: 30 }}>
          <Eyebrow step={def.step} label={def.chapter} />
          <WordTitle text={def.title} highlight={def.highlight} size={84} delay={4} />
          <div style={{ marginTop: 14 }}>
            <Chips chips={def.chips} startFrame={chipsStart} endFrame={chipsEnd} size={28} />
          </div>
        </div>
        <div style={{ position: "absolute", right: 240, top: 50 }}>
          <ScreenFrame width={390} height={812} {...frameProps} delay={10} />
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill>
      <Backdrop seed={seed} />
      <div style={{ position: "absolute", left: 72, top: 92, width: 400, display: "flex", flexDirection: "column", gap: 26 }}>
        <Eyebrow step={def.step} label={def.chapter} size={19} />
        <WordTitle text={def.title} highlight={def.highlight} size={58} delay={4} />
        <div style={{ marginTop: 10 }}>
          <Chips chips={def.chips} startFrame={chipsStart} endFrame={chipsEnd} size={21} />
        </div>
      </div>
      <div style={{ position: "absolute", right: 64, top: 66 }}>
        <ScreenFrame width={1350} height={803} {...frameProps} delay={10} />
      </div>
      {def.marquee ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: 20, opacity: 0.8 }}>
          <Marquee items={def.marquee} size={20} color={C.mutedOnInk} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
