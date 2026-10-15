import { assemblyBounds, minClearHeight } from "../assembly/bounds";
import type { Assembly } from "../components/types";
import { floorFunction } from "../envelope/floor";
import { absoluteObstacles, type Envelope } from "../envelope/types";
import { aabb, aabbIntersects } from "../math/aabb";
import { originOf } from "../math/mat4";
import { vec3 } from "../math/vec3";
import type { AccessLevel, AnchoringKind, SiteFactors } from "./types";

/**
 * Fattori di cantiere (P3, spec `preventivazione` – montaggio e complicazioni): numeri
 * ed enum calcolati dal dominio (ingombro + assieme) più quelli dichiarati dal cliente o
 * dall'ufficio (accesso, ancoraggio). Sono l'unico ingresso delle regole di complicazione.
 *
 * Deviazioni dallo squadro: arrivano dalla pianta dell'ingombro (gruppo 5, fuorisquadra)
 * tramite un `PlanDeviationProvider`. Finché la pianta non esiste il provider di default
 * restituisce 0; il gruppo 5 sostituisce `defaultPlanDeviations` (o passa il proprio
 * provider in `SiteFactorsOptions.planDeviations`) senza toccare il resto.
 */

/** Deviazioni dallo squadro (gradi, ≥ 0). */
export interface PlanDeviationSummary {
  /** Massima deviazione di un angolo della pianta da 90°. */
  readonly planDeviationDeg: number;
  /** Deviazione del lato muro dalla perpendicolare al fronte (tipologie addossate). */
  readonly wallDeviationDeg: number;
}

/** Calcola le deviazioni dalla pianta dell'ingombro (punto di aggancio del gruppo 5). */
export type PlanDeviationProvider = (envelope: Envelope) => PlanDeviationSummary;

/** Pianta rettangolare implicita (nessuna `Envelope.plan` prima del gruppo 5): deviazioni 0. */
export const defaultPlanDeviations: PlanDeviationProvider = () => ({ planDeviationDeg: 0, wallDeviationDeg: 0 });

/** Fattori dichiarati (non calcolabili) e sostituzioni esplicite. */
export interface DeclaredSiteFactors {
  /** Accesso al cantiere (dal cliente nel wizard o dall'ufficio); default `facile`. */
  readonly access?: AccessLevel;
  /** Ancoraggio; assente = dedotto dall'assieme (pilastri a terra, attacchi a muro). */
  readonly anchoring?: AnchoringKind;
  /** Affondamento dei pilastri (mm); assente = dedotto dai piedi dei pilastri. */
  readonly embedmentMm?: number;
}

export interface SiteFactorsOptions {
  readonly planDeviations?: PlanDeviationProvider;
}

const round6 = (x: number): number => {
  const r = Math.round(x * 1e6) / 1e6;
  return r === 0 ? 0 : r;
};

/** Ferramenta che fissa la struttura a un muro. */
const WALL_HARDWARE = new Set(["staffa-muro"]);
/** Pezzi che fissano la struttura a un muro. */
const WALL_PIECES = new Set(["banchina"]);

/** Ancoraggio dedotto: pilastri ⇒ terra, attacchi a muro ⇒ muro, entrambi ⇒ misto. */
export function inferAnchoring(assembly: Pick<Assembly, "pieces"> & { readonly hardware?: Assembly["hardware"] }): AnchoringKind {
  const ground = assembly.pieces.some((p) => p.type === "pilastro");
  const wall =
    assembly.pieces.some((p) => WALL_PIECES.has(p.type)) || (assembly.hardware ?? []).some((h) => WALL_HARDWARE.has(h.kind));
  if (wall && ground) return "misto";
  return wall ? "muro" : "terra";
}

/**
 * Fattori di cantiere dell'assieme nell'ingombro:
 * - `planDeviationDeg`, `wallDeviationDeg`: dal provider della pianta (0 senza pianta);
 * - `floorRangeMm`, `floorSlopePct`: `floorFunction` campionata agli angoli dell'impronta
 *   (AABB in pianta dell'assieme) e ai piedi dei pilastri; dislivello = max − min,
 *   pendenza = massimo |Δz| / distanza tra due campioni (%);
 * - `obstaclesCount`: ostacoli non ignorati la cui AABB interseca l'impronta estesa in Z;
 * - `maxHeightMm`: quota massima dell'assieme; `clearHeightMm`: `minClearHeight` sul
 *   pavimento reale (0 se l'assieme non ha copertura);
 * - `embedmentMm`: dichiarato o massimo affondamento dei piedi dei pilastri sotto il pavimento;
 * - `access`, `anchoring`: dichiarati (ancoraggio dedotto se assente).
 * Tutti i numeri sono arrotondati a 1e-6 (serializzazione deterministica).
 */
export function siteFactors(
  envelope: Envelope,
  assembly: Pick<Assembly, "pieces"> & { readonly hardware?: Assembly["hardware"] },
  declared: DeclaredSiteFactors = {},
  options: SiteFactorsOptions = {},
): SiteFactors {
  const deviations = (options.planDeviations ?? defaultPlanDeviations)(envelope);
  const floor = floorFunction(envelope);
  const bounds = assemblyBounds(assembly);

  // campioni del pavimento: angoli dell'impronta e piedi dei pilastri
  const samples: { x: number; y: number; z: number }[] = [];
  const posts = assembly.pieces.filter((p) => p.type === "pilastro");
  if (bounds) {
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y]) samples.push({ x, y, z: floor(x, y) });
  }
  let embedment = 0;
  for (const p of posts) {
    const foot = originOf(p.pose);
    const z = floor(foot.x, foot.y);
    samples.push({ x: foot.x, y: foot.y, z });
    embedment = Math.max(embedment, z - foot.z);
  }
  let floorRange = 0;
  let floorSlope = 0;
  if (samples.length > 0) {
    const zs = samples.map((s) => s.z);
    floorRange = Math.max(...zs) - Math.min(...zs);
    for (let i = 0; i < samples.length; i++)
      for (let j = i + 1; j < samples.length; j++) {
        const d = Math.hypot(samples[i].x - samples[j].x, samples[i].y - samples[j].y);
        if (d > 1) floorSlope = Math.max(floorSlope, (Math.abs(samples[i].z - samples[j].z) / d) * 100);
      }
  }

  // ostacoli sull'impronta estesa in Z
  let obstaclesCount = 0;
  if (bounds) {
    const footprint = aabb(vec3(bounds.min.x, bounds.min.y, -Infinity), vec3(bounds.max.x, bounds.max.y, Infinity));
    obstaclesCount = absoluteObstacles(envelope).filter((o) => !o.ignored && aabbIntersects(o.aabb, footprint)).length;
  }

  const clear = minClearHeight(assembly, { floorHeightAt: floor });
  return {
    planDeviationDeg: round6(deviations.planDeviationDeg),
    wallDeviationDeg: round6(deviations.wallDeviationDeg),
    floorSlopePct: round6(floorSlope),
    floorRangeMm: round6(floorRange),
    obstaclesCount,
    maxHeightMm: round6(bounds?.max.z ?? 0),
    clearHeightMm: round6(clear?.value ?? 0),
    // sotto 1 µm è rumore numerico, non affondamento
    embedmentMm: round6(declared.embedmentMm ?? (embedment > 1e-3 ? embedment : 0)),
    access: declared.access ?? "facile",
    anchoring: declared.anchoring ?? inferAnchoring(assembly),
  };
}

/** Etichette italiane dei fattori, per spiegazioni e form. */
export const SITE_FACTOR_LABELS: Readonly<Record<keyof SiteFactors, string>> = {
  planDeviationDeg: "deviazione dallo squadro",
  wallDeviationDeg: "deviazione del muro",
  floorSlopePct: "pendenza del pavimento",
  floorRangeMm: "dislivello del pavimento",
  obstaclesCount: "ostacoli sulla pergola",
  maxHeightMm: "altezza massima",
  clearHeightMm: "altezza libera",
  embedmentMm: "affondamento dei pilastri",
  access: "accesso",
  anchoring: "ancoraggio",
};

/** Unità dei fattori numerici (per le spiegazioni). */
export const SITE_FACTOR_UNITS: Readonly<Record<keyof SiteFactors, string>> = {
  planDeviationDeg: "°",
  wallDeviationDeg: "°",
  floorSlopePct: "%",
  floorRangeMm: " mm",
  obstaclesCount: "",
  maxHeightMm: " mm",
  clearHeightMm: " mm",
  embedmentMm: " mm",
  access: "",
  anchoring: "",
};

