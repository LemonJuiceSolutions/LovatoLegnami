import type { ObstacleKind } from "./answers"

/**
 * Illustrazioni del passo spazio: disegni a tratto (colore del testo, quote in oro) per
 * spiegare cosa misurare senza parole tecniche. Solo SVG in linea, nessuna immagine.
 */

/** Pianta vista dall'alto con il muro, i lati e le due diagonali da misurare. */
export function DiagonalsDrawing({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 230" className={className} role="img" aria-labelledby="diag-title diag-desc">
      <title id="diag-title">Come misurare lo spazio</title>
      <desc id="diag-desc">
        Vista dall&apos;alto: il muro in alto, il fronte in basso, i due lati e le due diagonali che uniscono gli angoli opposti.
      </desc>
      {/* muro */}
      <rect x="30" y="18" width="260" height="14" fill="currentColor" opacity="0.12" />
      <path d="M30 32 L290 32" stroke="currentColor" strokeWidth="3" />
      {[...Array(13)].map((_, i) => (
        <path key={i} d={`M${36 + i * 20} 18 l-10 14`} stroke="currentColor" strokeWidth="1" opacity="0.45" />
      ))}
      <text x="160" y="13" textAnchor="middle" fontSize="12" fill="currentColor">
        muro di casa
      </text>
      {/* spazio (leggermente fuori squadra) */}
      <path d="M44 196 L278 196 L290 32 L30 32 Z" fill="hsl(var(--primary) / 0.07)" stroke="currentColor" strokeWidth="2" />
      {/* diagonali */}
      <path d="M44 196 L290 32" stroke="hsl(var(--site-gold))" strokeWidth="2.5" strokeDasharray="7 5" />
      <path d="M278 196 L30 32" stroke="hsl(var(--site-gold))" strokeWidth="2.5" strokeDasharray="7 5" />
      {[
        [44, 196],
        [278, 196],
        [290, 32],
        [30, 32],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="4.5" fill="currentColor" />
      ))}
      <Badge x={160} y={214} n="1" label="fronte" />
      <Badge x={160} y={48} n="2" label="muro" />
      <Badge x={24} y={118} n="3" label="sinistra" anchor="start" />
      <Badge x={296} y={118} n="4" label="destra" anchor="end" />
      <Badge x={110} y={100} n="5" label="" />
      <Badge x={210} y={100} n="6" label="" />
    </svg>
  )
}

function Badge({ x, y, n, label, anchor = "middle" }: { x: number; y: number; n: string; label: string; anchor?: "start" | "middle" | "end" }) {
  const cx = anchor === "start" ? x + 11 : anchor === "end" ? x - 11 : x
  return (
    <g>
      <circle cx={cx} cy={y} r="11" fill="hsl(var(--primary))" />
      <text x={cx} y={y + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="hsl(var(--primary-foreground))">
        {n}
      </text>
      {label && (
        <text x={anchor === "middle" ? cx + 16 : cx} y={anchor === "middle" ? y + 4 : y + 26} textAnchor={anchor === "middle" ? "start" : "middle"} fontSize="12" fill="currentColor">
          {label}
        </text>
      )}
    </g>
  )
}

/** Pavimento in pendenza visto di lato. */
export function FloorDrawing({ slope, className }: { slope: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 120 60" className={className} aria-hidden="true">
      <path d={slope ? "M8 40 L112 52" : "M8 48 L112 48"} stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M26 12 L26 44 M94 12 L94 50 M18 12 L102 12" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity="0.55" />
      {slope && <path d="M108 40 L108 52" stroke="hsl(var(--site-gold))" strokeWidth="2" />}
    </svg>
  )
}

export function ObstacleIcon({ kind, className }: { kind: ObstacleKind; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }
  return (
    <svg viewBox="0 0 32 32" className={className ?? "h-8 w-8"} aria-hidden="true">
      <path d="M4 3 V29" {...common} opacity="0.5" />
      {kind === "grondaia" && <path d="M4 9 H24 Q27 9 27 12 V13 H8 Q6 13 6 11" {...common} />}
      {kind === "balcone" && <path d="M4 10 H28 V14 H4 M10 14 V22 M16 14 V22 M22 14 V22 M8 22 H28" {...common} />}
      {kind === "finestra" && <path d="M10 8 H24 V22 H10 Z M17 8 V22 M10 15 H24" {...common} />}
      {kind === "porta" && <path d="M10 29 V6 H22 V29 M19 18 H19.5" {...common} />}
      {kind === "pluviale" && <path d="M10 4 H16 V27 Q16 29 18 29 H22" {...common} />}
      {kind === "altro" && <path d="M10 12 H22 V24 H10 Z M10 12 L14 8 H26 L22 12 M26 8 V20 L22 24" {...common} />}
    </svg>
  )
}
