import React from "react";
import { AbsoluteFill, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, F, GRADIENT } from "../theme";
import { ease } from "./anim";

/**
 * Finestra browser (rounded-2xl, ombra morbida) o telefono che contiene la registrazione dello schermo.
 * Se la registrazione manca mostra un segnaposto animato con il titolo della scena.
 */
export const ScreenFrame: React.FC<{
  width: number; height: number; device: "browser" | "phone"; src: string | null; recordingFile: string;
  title: string; url?: string; duration: number; delay?: number; playbackRate?: number;
}> = ({ width, height, device, src, recordingFile, title, url, duration, delay = 4, playbackRate = 1 }) => {
  const f = useCurrentFrame();
  const p = ease(f, delay, 22);
  // zoom lento 1.0 → 1.08 sul contenuto
  const zoom = interpolate(f, [0, duration], [1, 1.04], { extrapolateRight: "clamp" });
  const isPhone = device === "phone";
  const radius = isPhone ? width * 0.12 : 16;
  const bar = isPhone ? 0 : Math.round(height * 0.055);
  const content = (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: isPhone ? radius * 0.8 : 0 }}>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${zoom})` }}>
        {src ? (
          <OffthreadVideo src={staticFile(src)} muted playbackRate={playbackRate} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <Placeholder title={title} file={recordingFile} phone={isPhone} />
        )}
      </div>
    </div>
  );
  return (
    <div
      style={{
        width, height, position: "relative", opacity: p, transform: `translateY(${(1 - p) * 40}px) scale(${0.97 + 0.03 * p})`,
        borderRadius: radius, background: isPhone ? "#111" : C.paper, padding: isPhone ? width * 0.035 : 0,
        boxShadow: "0 40px 120px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.10)",
      }}
    >
      {isPhone ? (
        <div style={{ position: "absolute", inset: width * 0.035, borderRadius: radius * 0.8, overflow: "hidden", background: C.cream }}>
          {content}
          <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", width: width * 0.3, height: width * 0.075, borderRadius: 99, background: "#111" }} />
        </div>
      ) : (
        <>
          <div style={{ height: bar, display: "flex", alignItems: "center", gap: 10, padding: "0 18px", background: "#ECEBE7", borderRadius: "16px 16px 0 0", borderBottom: `1px solid ${C.lineOnCream}` }}>
            {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <div key={c} style={{ width: bar * 0.3, height: bar * 0.3, borderRadius: 99, background: c }} />)}
            <div style={{ flex: 1, marginLeft: 18, height: bar * 0.56, borderRadius: 99, background: C.paper, display: "flex", alignItems: "center", padding: "0 16px", fontFamily: F.mono, fontSize: bar * 0.3, color: C.mutedOnCream }}>
              {url ?? "espeiria.lemonjuicesolutions.it"}
            </div>
          </div>
          <div style={{ position: "absolute", top: bar, left: 0, right: 0, bottom: 0, borderRadius: "0 0 16px 16px", overflow: "hidden", background: C.cream }}>
            {content}
          </div>
        </>
      )}
    </div>
  );
};

/** Segnaposto animato: card con titolo, pergola wireframe che si disegna, skeleton UI e cursore finto. */
const Placeholder: React.FC<{ title: string; file: string; phone: boolean }> = ({ title, file, phone }) => {
  const f = useCurrentFrame();
  const draw = ease(f, 8, 70);
  const shimmer = (f * 1.6) % 300;
  const s = phone ? 0.55 : 1;
  const cx = 70 + 10 * Math.sin(f / 23), cy = 58 + 8 * Math.cos(f / 31);
  const click = f % 75 < 8;
  return (
    <AbsoluteFill style={{ background: C.cream, fontFamily: F.body, color: C.ink }}>
      <AbsoluteFill style={{ padding: phone ? "64px 18px 18px" : 36, display: "flex", flexDirection: phone ? "column" : "row", gap: 28 * s }}>
        {/* colonna "form" skeleton */}
        <div style={{ flex: phone ? "0 0 auto" : "0 0 30%", display: "flex", flexDirection: "column", gap: 14 * s }}>
          <div style={{ fontFamily: F.mono, fontSize: 15 * s + 3, letterSpacing: "0.22em", color: C.mutedOnCream }}>REGISTRAZIONE IN ARRIVO</div>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 44 * s + 6, letterSpacing: "-0.03em", lineHeight: 1.05 }}>{title}</div>
          <div style={{ height: 3, width: `${30 + 50 * draw}%`, backgroundImage: GRADIENT, borderRadius: 3 }} />
          {Array.from({ length: phone ? 3 : 6 }).map((_, i) => (
            <div key={i} style={{ height: 30 * s + 8, borderRadius: 10, border: `1px solid ${C.lineOnCream}`, background: `linear-gradient(90deg, #fff 0%, #fff ${shimmer - 40}%, #EEF4F1 ${shimmer - 10}%, #fff ${shimmer + 20}%)`, opacity: ease(f, 10 + i * 4, 14) }} />
          ))}
          <div style={{ fontFamily: F.mono, fontSize: 13 * s + 4, color: C.mutedOnCream, marginTop: 6, wordBreak: "break-all" }}>public/recordings/{file}</div>
        </div>
        {/* area "viewer 3D": pergola addossata in assonometria che si disegna */}
        <div style={{ flex: 1, position: "relative", borderRadius: 16, border: `1px solid ${C.lineOnCream}`, background: "linear-gradient(180deg,#FFFFFF,#EFEDE6)", overflow: "hidden" }}>
          <Pergola draw={draw} t={f} />
          {/* cursore finto */}
          <svg width={28} height={28} viewBox="0 0 24 24" style={{ position: "absolute", left: `${cx}%`, top: `${cy}%`, transform: `scale(${click ? 0.85 : 1})` }}>
            <path d="M3 2l7 19 2.5-7.5L20 11z" fill={C.ink} stroke="#fff" strokeWidth={1.5} />
          </svg>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Pergola wireframe (4 pilastri, 2 travi, travetti) in proiezione assonometrica che ruota leggermente. */
const Pergola: React.FC<{ draw: number; t: number }> = ({ draw, t }) => {
  const a = 0.6 + Math.sin(t / 60) * 0.25;
  const P = (x: number, y: number, z: number) => {
    const X = x * Math.cos(a) - y * Math.sin(a);
    const Y = x * Math.sin(a) + y * Math.cos(a);
    return [200 + X * 38, 230 - z * 38 + Y * 16] as const;
  };
  const lines: [number, number, number, number, number, number, string][] = [];
  const W = 2.4, D = 1.8, H = 2.6;
  for (const [x, y] of [[-W, -D], [W, -D], [-W, D], [W, D]]) lines.push([x, y, 0, x, y, H, "#6E20C2"]);
  lines.push([-W - 0.4, -D, H, W + 0.4, -D, H, "#6E20C2"], [-W - 0.4, D, H, W + 0.4, D, H, "#6E20C2"]);
  for (let i = 0; i <= 8; i++) {
    const x = -W - 0.3 + (i * (2 * W + 0.6)) / 8;
    lines.push([x, -D - 0.4, H + 0.15, x, D + 0.4, H + 0.15, "#00B8E0"]);
  }
  return (
    <svg viewBox="0 0 400 300" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
      <ellipse cx={200} cy={232} rx={150} ry={34} fill="rgba(11,12,20,0.06)" />
      {lines.map(([x1, y1, z1, x2, y2, z2, col], i) => {
        const [ax, ay] = P(x1, y1, z1), [bx, by] = P(x2, y2, z2);
        const len = Math.hypot(bx - ax, by - ay);
        const local = Math.max(0, Math.min(1, draw * lines.length * 0.6 - i * 0.5));
        return <line key={i} x1={ax} y1={ay} x2={bx} y2={by} stroke={col} strokeWidth={i < 6 ? 5 : 3.5} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - local)} />;
      })}
    </svg>
  );
};
