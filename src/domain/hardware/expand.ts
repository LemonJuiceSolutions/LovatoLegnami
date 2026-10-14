import { addMachining } from "../components/machinings";
import type { HardwareItem, LateralFace, Piece } from "../components/types";
import { arcFrame } from "../math/arc";
import { applyToPoint, applyToVector, fromBasis, invertRigid, type Mat4 } from "../math/mat4";
import { type Vec3, add, cross, dot, normalize, scale, vec3 } from "../math/vec3";
import { hardwareFor } from "./catalog";
import { HardwareError } from "./errors";
import type { HardwareSpec } from "./types";

/**
 * Espansione della ferramenta in lavorazioni sui pezzi di legno e in voci
 * dell'elenco ferramenta (E3). Funzioni pure: restituiscono nuovi pezzi.
 */

/** Margine tra spessore serrato e lunghezza del bullone (dado + rondelle), mm. DA VALIDARE CON UFFICIO TECNICO. */
export const BOLT_MARGIN = 20;

/** Gioco del foro rispetto al diametro del bullone (mm): Ø12 → foro Ø13. DA VALIDARE CON UFFICIO TECNICO. */
export const BOLT_HOLE_CLEARANCE = 1;

/**
 * Bullone passante: asse perpendicolare alla faccia `face` del primo pezzo
 * nel punto (`at`, `offset`) (convenzione del `foro`: `offset` lungo Z per
 * sinistra/destra, lungo Y per superiore/inferiore), diretto verso l'interno.
 * `pieces` = id dei pezzi attraversati, il primo è quello di partenza.
 */
export interface BoltStep {
  /** Id della voce di ferramenta (`BUL-nn`), assegnato da chi espande. */
  readonly id: string;
  readonly pieces: readonly string[];
  readonly face: LateralFace;
  readonly at: number;
  readonly offset: number;
  /** Diametro nominale del bullone (mm). */
  readonly diameter: number;
}

export interface HardwareExpansion {
  /** Elenco completo dei pezzi (stesso ordine), con le lavorazioni indotte. */
  readonly pieces: Piece[];
  readonly item: HardwareItem;
}

/** Normale uscente e componente trasversale (`offset`) di una faccia laterale, nel locale. */
const FACE_FRAMES: Readonly<Record<LateralFace, { n: Vec3; across: "y" | "z" }>> = {
  superiore: { n: vec3(0, 0, 1), across: "y" },
  inferiore: { n: vec3(0, 0, -1), across: "y" },
  sinistra: { n: vec3(0, 1, 0), across: "z" },
  destra: { n: vec3(0, -1, 0), across: "z" },
};

const fmt = (n: number): string => String(Math.round(n * 10) / 10).replace(".", ",");

interface Crossing {
  /** Parametri d'ingresso e uscita lungo la retta del bullone (mm, direzione unitaria). */
  readonly t0: number;
  readonly t1: number;
  readonly face: LateralFace;
  readonly at: number;
  readonly offset: number;
}

/** Faccia laterale con normale uscente opposta a `d` (locale), se `d` è perpendicolare a una faccia. */
function entryFace(d: Vec3): LateralFace | undefined {
  for (const [face, { n }] of Object.entries(FACE_FRAMES) as [LateralFace, (typeof FACE_FRAMES)[LateralFace]][])
    if (dot(n, d) < -1 + 1e-6) return face;
  return undefined;
}

/**
 * Attraversamento della retta `o + t·d` (sistema assieme, `d` unitario) con il
 * pezzo: intervallo del box (pezzi dritti, metodo delle lastre) oppure dello
 * spessore lungo Y alla coordinata curvilinea del punto (pezzi curvi).
 * `undefined` se il pezzo non è attraversato.
 */
function crossing(p: Piece, o: Vec3, d: Vec3, boltId: string, code: string): Crossing | undefined {
  const inv = invertRigid(p.pose);
  const lo = applyToPoint(inv, o);
  const ld = applyToVector(inv, d);
  const { b, h } = p.section;
  const face = entryFace(ld);
  if (!face)
    throw new HardwareError(code, `l'asse del bullone non è perpendicolare a una faccia laterale del pezzo ${p.id}`, boltId);
  const axis = face === "sinistra" || face === "destra" ? "y" : "z";
  const half = axis === "y" ? b / 2 : h / 2;
  // ingresso e uscita sui due piani della faccia (la retta è perpendicolare)
  const c = axis === "y" ? lo.y : lo.z;
  const v = axis === "y" ? ld.y : ld.z;
  const ta = (half - c) / v;
  const tb = (-half - c) / v;
  const t0 = Math.min(ta, tb);
  const t1 = Math.max(ta, tb);
  const q = add(lo, scale(ld, t0)); // punto d'ingresso (locale)
  if (p.curve) {
    if (axis !== "y") throw new HardwareError(code, `sul pezzo curvo ${p.id} il bullone deve attraversare le facce laterali sinistra/destra`, boltId);
    const R = p.curve.radius;
    const theta = Math.atan2(q.x, R - q.z);
    const r = Math.hypot(q.x, R - q.z);
    const at = R * theta;
    const offset = R - r;
    if (theta < 0 || at > p.length || Math.abs(offset) > h / 2) return undefined;
    return { t0, t1, face, at, offset };
  }
  const offset = axis === "y" ? q.z : q.y;
  const crossAxis = axis === "y" ? h / 2 : b / 2;
  if (q.x < 0 || q.x > p.length || Math.abs(offset) > crossAxis) return undefined;
  return { t0, t1, face, at: q.x, offset };
}

/** Bullone più corto a catalogo con il diametro dato e lunghezza ≥ `grip + BOLT_MARGIN`. */
export function boltFor(diameter: number, grip: number, boltId?: string): HardwareSpec {
  const candidates = hardwareFor("bullone")
    .filter((s) => s.diameter === diameter)
    .sort((a, b) => a.length! - b.length!);
  const spec = candidates.find((s) => s.length! >= grip + BOLT_MARGIN - 1e-6);
  if (!spec)
    throw new HardwareError(
      `bullone-m${diameter}`,
      `nessun bullone M${diameter} a catalogo per uno spessore di ${fmt(grip)} mm (servono ${fmt(grip + BOLT_MARGIN)} mm; disponibili: ${candidates.map((s) => s.length).join(", ") || "nessuno"})`,
      boltId,
    );
  return spec;
}

/**
 * Bullone passante su più strati (spec `ferramenta-e-ancoraggi`): retta
 * dell'asse dal punto sulla faccia del primo pezzo, un `foro` passante Ø
 * `diameter + 1` su ogni pezzo dichiarato (faccia d'ingresso, `at` e `offset`
 * locali, `jointId` = id del bullone) e una voce `bullone` con la lunghezza di
 * catalogo minima ≥ spessore serrato + `BOLT_MARGIN`. Un pezzo dichiarato e
 * non attraversato → `HardwareError` con pezzo e bullone.
 */
export function expandBolt(step: BoltStep, pieces: readonly Piece[]): HardwareExpansion {
  const code = `bullone-m${step.diameter}`;
  if (step.pieces.length === 0) throw new HardwareError(code, "nessun pezzo da attraversare", step.id);
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const declared = step.pieces.map((id) => {
    const p = byId.get(id);
    if (!p) throw new HardwareError(code, `pezzo ${id} non trovato`, step.id);
    return p;
  });
  if (new Set(step.pieces).size !== step.pieces.length) throw new HardwareError(code, "pezzo ripetuto nell'elenco", step.id);

  // asse del bullone nel sistema assieme
  const first = declared[0];
  const ff = FACE_FRAMES[step.face];
  const { b, h } = first.section;
  const dist = ff.across === "z" ? b / 2 : h / 2;
  let localStart = add(scale(ff.n, dist), ff.across === "z" ? vec3(step.at, 0, step.offset) : vec3(step.at, step.offset, 0));
  if (first.curve) {
    // pezzo curvo: punto della sezione alla coordinata curvilinea `at` (solo facce sinistra/destra)
    if (ff.across !== "z") throw new HardwareError(code, `sul pezzo curvo ${first.id} il bullone deve partire da sinistra/destra`, step.id);
    localStart = applyToPoint(arcFrame(first.curve.radius, step.at), vec3(0, ff.n.y * dist, step.offset));
  }
  const o = applyToPoint(first.pose, localStart);
  const d = normalize(applyToVector(first.pose, scale(ff.n, -1)));

  const crossings = declared.map((p) => {
    const c = crossing(p, o, d, step.id, code);
    if (!c) throw new HardwareError(code, `il pezzo ${p.id} non è attraversato dall'asse del bullone ${step.id}`, step.id);
    return c;
  });
  const tStart = Math.min(...crossings.map((c) => c.t0));
  const tEnd = Math.max(...crossings.map((c) => c.t1));
  const grip = tEnd - tStart;
  const spec = boltFor(step.diameter, grip, step.id);

  const machiningIds: string[] = [];
  const updated = new Map<string, Piece>();
  declared.forEach((p, i) => {
    const c = crossings[i];
    const np = addMachining(p, {
      type: "foro",
      face: c.face,
      at: c.at,
      offset: c.offset,
      diameter: step.diameter + BOLT_HOLE_CLEARANCE,
      jointId: step.id,
    });
    machiningIds.push(np.machinings[np.machinings.length - 1].id);
    updated.set(p.id, np);
  });

  // posa: origine all'ingresso, X lungo l'asse del bullone
  const helper = Math.abs(d.z) < 0.9 ? vec3(0, 0, 1) : vec3(1, 0, 0);
  const z = normalize(cross(cross(d, helper), d));
  const pose: Mat4 = fromBasis(add(o, scale(d, tStart)), d, z);
  const item: HardwareItem = {
    id: step.id,
    code: spec.code,
    kind: "bullone",
    description: spec.name,
    quantity: 1,
    pose,
    dims: spec.dims,
    pieceIds: [...step.pieces],
    machiningIds,
    params: { diameter: step.diameter, length: spec.length!, grip },
  };
  return { pieces: pieces.map((p) => updated.get(p.id) ?? p), item };
}
