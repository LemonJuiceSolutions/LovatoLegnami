import { parseSectionLabel, sectionLabel } from "../../components/sections";
import type { Section } from "../../components/types";
import { hardwareFor } from "../../hardware/catalog";
import { NODE_REACH } from "../../hardware/expand";
import type { HardwareSpec } from "../../hardware/types";
import { degToRad, fromBasis } from "../../math/mat4";
import { plane } from "../../math/plane";
import { type Vec3, add, norm, normalize, scale, sub, vec3 } from "../../math/vec3";
import { ParamError, type BuildContext, type BuildStep, type TypologyTemplate } from "../template";
import { type Placed, columnStep, enumParam, headCutOnPlane, numberParam, placeStep } from "./shared";

/** Pendenza della monofalda a giunti 75°/105° (gradi, ricerca T-D). */
const JOINT_SLOPE = 15;
/** Interasse minimo tra due pilastri o due file (mm). */
const MIN_BAY = 1000;
/** Distanza minima tra un traverso e la testa dell'asta su cui si innesta (oltre la portata del nodo, mm). */
const TRAVERSE_MARGIN = 20;

type Forma = "piana" | "monofalda-15";
type Fissaggio = "libera" | "addossata";
type Layout = NonNullable<HardwareSpec["joint"]>["layout"];

/**
 * Voce di giunto per vie, sezione e angolo: linea JOINT (2/3L/3A/4 vie) e,
 * per i nodi a 5 vie (griglie con pilastri interni), giunti zincati.
 * `ParamError` se la combinazione non è a catalogo.
 */
function jointSpec(layout: Layout, section: Section, angle: 75 | 90 | 105, param: string, value: string): HardwareSpec {
  const zinc = layout === "5";
  const spec = hardwareFor("giunto-vie", section).find(
    (s) =>
      s.joint?.layout === layout &&
      (s.angle ?? 90) === angle &&
      (zinc ? /^giunto-\d/.test(s.code) : s.code.startsWith("giunto-joint-")),
  );
  if (!spec)
    throw new ParamError(param, value, `nessun giunto ${layout} vie a ${angle}° per aste ${sectionLabel(section)} a catalogo`);
  return spec;
}

/** Riduzione dell'asta per ogni nodo in cui entra: ingombro/2 − inserimento. */
const reduction = (s: HardwareSpec): number => s.joint!.node / 2 - s.joint!.insertion;

interface NodeInfo {
  readonly point: Vec3;
  readonly spec: HardwareSpec;
  /** Ref delle aste che convergono (pilastro per primo). */
  readonly members: string[];
}

/**
 * Geometria del telaio a giunti metallici (E5, ricerca T-D "pergola moderna"):
 *
 * - griglia di nodi `(campate + 1) × (campateProfondita + 1)` (facce esterne dei
 *   pilastri d'angolo sugli assi x = 0 e y = 0) con interassi
 *   `larghezza / campate` lungo X e `profondita / campateProfondita` lungo Y;
 *   ogni nodo è il centro di un giunto (quota `altezza + h/2`, intradosso delle
 *   aste orizzontali a `altezza`);
 * - pilastri sotto ogni nodo (tranne la fila a muro in `addossata`), travi
 *   lungo X su ogni fila e lungo Y su ogni colonna, tutte a sezione unica e
 *   tagliate a squadra: lunghezza netta = distanza tra i nodi − Σ (A/2 − i)
 *   delle voci dei due nodi (A ingombro, i inserimento);
 * - traversi lungo Y in ogni campata X (il minimo numero con interasse ≤
 *   `interasseTraversi`), innestati con giunti a 3 vie lineari sulle travi X
 *   che li attraversano (la trave passa nel manicotto);
 * - `monofalda-15`: nodi della fila posteriore rialzati di
 *   `profondita·tan 15°`, aste lungo Y inclinate, giunti 105° (fila bassa) e
 *   75° (fila alta);
 * - `addossata`: la fila posteriore è il muro (piano y = `profondita`), le
 *   aste lungo Y vi terminano con la staffa per listone (taglio sul piano del
 *   muro se inclinate); staffe a terra JOINT al piede dei pilastri.
 */
function geometry(ctx: BuildContext) {
  const W = ctx.num("larghezza");
  const P = ctx.num("profondita");
  const H = ctx.num("altezza");
  const nx = ctx.num("campate");
  const ny = ctx.num("campateProfondita");
  const forma = ctx.enum("forma") as Forma;
  const fissaggio = ctx.enum("fissaggio") as Fissaggio;
  const sectionValue = ctx.enum("sezioneAsta");
  const s = parseSectionLabel(sectionValue)!;
  const slope = forma === "monofalda-15" ? JOINT_SLOPE : 0;
  const t = Math.tan(degToRad(slope));
  if (slope && ny > 1)
    throw new ParamError("campateProfondita", ny, "in monofalda a 15° ogni nodo riceve una sola asta inclinata: una campata in profondità");
  const bayX = W / nx;
  const bayY = P / ny;
  if (bayX < MIN_BAY) throw new ParamError("campate", nx, `interasse dei pilastri di ${Math.round(bayX)} mm: servono almeno ${MIN_BAY} mm`);
  if (bayY < MIN_BAY)
    throw new ParamError("campateProfondita", ny, `interasse delle file di ${Math.round(bayY)} mm: servono almeno ${MIN_BAY} mm`);
  // origine sulle facce esterne dei pilastri d'angolo (pianta nel quadrante positivo)
  const pad = s.b / 2;
  const xs = Array.from({ length: nx + 1 }, (_, i) => pad + i * bayX);
  const ys = Array.from({ length: ny + 1 }, (_, j) => pad + j * bayY);
  const zNode = (y: number): number => H + s.h / 2 + (y - pad) * t;
  const wallRow = fissaggio === "addossata" ? ny : -1;
  return { W, P, H, nx, ny, forma, fissaggio, s, sectionValue, slope, t, bayX, bayY, pad, xs, ys, zNode, wallRow };
}

type Geometry = ReturnType<typeof geometry>;

/** Layout e angolo del nodo sul pilastro (i, j) dagli elementi che vi convergono. */
function postNodeSpec(g: Geometry, i: number, j: number): HardwareSpec {
  const xWays = (i > 0 ? 1 : 0) + (i < g.nx ? 1 : 0);
  const hasFront = j > 0;
  const hasBack = j < g.ny;
  const yWays = (hasFront ? 1 : 0) + (hasBack ? 1 : 0);
  const ways = 1 + xWays + yWays;
  const layout: Layout = ways === 3 ? "3A" : ways === 4 ? "4" : "5";
  // asta inclinata in salita verso +Y: 105° dal pilastro nella fila bassa, 75° nella fila alta
  const angle = !g.slope ? 90 : hasBack ? 105 : 75;
  return jointSpec(layout, g.s, angle, g.slope ? "forma" : "sezioneAsta", g.slope ? g.forma : g.sectionValue);
}

export const telaioGiunti: TypologyTemplate = {
  slug: "telaio-giunti",
  name: "Telaio a giunti metallici",
  description:
    "Pergola moderna a griglia: pilastri, travi e traversi a sezione unica tagliati a squadra e infilati in giunti metallici a manicotto, piana o monofalda 15°, libera o addossata.",
  category: "autoportante",
  tags: ["moderna", "giunti", "JOINT", "griglia", "piana", "monofalda", "addossata", "70×70", "90×90"],
  reference: "T-D",
  params: [
    numberParam("larghezza", "Larghezza (interasse dei pilastri d'estremità)", "mm", 1500, 8000, 2580, 10),
    numberParam("profondita", "Profondità (interasse delle file)", "mm", 1500, 6000, 2580, 10),
    numberParam("altezza", "Altezza sotto trave", "mm", 1800, 3500, 2445, 5, {
      description: "Intradosso delle aste orizzontali sulla fila bassa (pilastri = altezza − h/2 con il giunto JOINT 90).",
    }),
    numberParam("campate", "Campate in larghezza", "n", 1, 4, 1, 1, { integer: true }),
    numberParam("campateProfondita", "Campate in profondità", "n", 1, 3, 1, 1, { integer: true }),
    numberParam("interasseTraversi", "Interasse massimo dei traversi", "mm", 600, 3000, 1100, 10, {
      description: "Distanza massima tra le aste lungo Y: traversi intermedi aggiunti in ogni campata.",
    }),
    enumParam("sezioneAsta", "Sezione delle aste", [["90×90", "90×90"], ["70×70", "70×70"]], "90×90"),
    enumParam(
      "forma",
      "Forma",
      [
        ["piana", "Piana", "Telaio orizzontale, giunti a 90°."],
        ["monofalda-15", "Monofalda 15°", "Fila posteriore rialzata, giunti 75°/105° (solo 90×90)."],
      ],
      "piana",
    ),
    enumParam(
      "fissaggio",
      "Fissaggio",
      [
        ["libera", "Libera", "Pilastri su tutte le file."],
        ["addossata", "Addossata", "Fila posteriore a muro con staffe per listone."],
      ],
      "libera",
    ),
    { kind: "boolean", name: "staffeTerra", label: "Staffe a terra JOINT", default: true },
  ],

  build(ctx) {
    const g = geometry(ctx);
    const s = g.s;
    const steps: BuildStep[] = [];
    const nodes: NodeInfo[] = [];
    const nodeAt = new Map<string, NodeInfo>();
    const key = (i: number, j: number) => `${i}:${j}`;

    // nodi sui pilastri e pilastri
    for (let j = 0; j <= g.ny; j++) {
      if (j === g.wallRow) continue;
      for (let i = 0; i <= g.nx; i++) {
        const spec = postNodeSpec(g, i, j);
        const point = vec3(g.xs[i], g.ys[j], g.zNode(g.ys[j]));
        const ref = `pilastro-${i}-${j}`;
        const post = columnStep(ctx, ref, point.x, point.y, point.z - reduction(spec), s);
        steps.push({ ...post, label: "pilastro" });
        if (ctx.bool("staffeTerra")) {
          const code = hardwareFor("staffa-terra", s).find((h) => h.code.startsWith("staffa-terra-joint-"))?.code;
          if (!code) throw new ParamError("staffeTerra", true, `nessuna staffa a terra JOINT per ${sectionLabel(s)}`);
          steps.push({ kind: "hardware", code, pieces: [ref], anchor: "piede" });
        }
        const node = { point, spec, members: [ref] };
        nodes.push(node);
        nodeAt.set(key(i, j), node);
      }
    }

    /** Asta orizzontale o inclinata tra due punti d'asse, accorciata di `r0`/`r1` alle teste. */
    const bar = (ref: string, a: Vec3, b: Vec3, r0: number, r1: number): Placed => {
      const X = normalize(sub(b, a));
      const Z = normalize(sub(vec3(0, 0, 1), scale(X, X.z))); // Z locale verticale nel piano dell'asta
      const length = norm(sub(b, a)) - r0 - r1;
      return { ref, type: "trave", section: s, length, pose: fromBasis(add(a, scale(X, r0)), X, Z) };
    };

    // travi lungo X su ogni fila (tranne il muro)
    const xBeams: Placed[][] = [];
    for (let j = 0; j <= g.ny; j++) {
      if (j === g.wallRow) continue;
      const row: Placed[] = [];
      for (let i = 0; i < g.nx; i++) {
        const [n0, n1] = [nodeAt.get(key(i, j))!, nodeAt.get(key(i + 1, j))!];
        const beam = bar(`trave-x-${i}-${j}`, n0.point, n1.point, reduction(n0.spec), reduction(n1.spec));
        steps.push(placeStep(beam, "trave"));
        n0.members.push(beam.ref);
        n1.members.push(beam.ref);
        row.push(beam);
      }
      xBeams[j] = row;
    }

    // aste lungo Y (colonne e traversi): tra due nodi, o dal nodo al muro con la staffa per listone
    const wall = plane(vec3(0, g.pad + g.P, 0), vec3(0, -1, 0));
    const wallCode = (): string => {
      const code = hardwareFor("staffa-muro", s).find((h) => h.code.startsWith("staffa-listone-"))?.code;
      if (!code) throw new ParamError("fissaggio", g.fissaggio, `nessuna staffa per listone ${sectionLabel(s)} a catalogo`);
      return code;
    };
    const yBar = (ref: string, x: number, front: NodeInfo, back: NodeInfo | undefined, label: string) => {
      const a = front.point;
      if (back) {
        const beam = bar(ref, a, back.point, reduction(front.spec), reduction(back.spec));
        steps.push(placeStep(beam, label));
        front.members.push(ref);
        back.members.push(ref);
        return;
      }
      // al muro: lo spigolo superiore della testa sul piano del muro (asse oltre il muro di (h/2)·sin α)
      const sn = Math.sin(degToRad(g.slope));
      const yEnd = g.pad + g.P + (s.h / 2) * sn;
      const b = vec3(x, yEnd, g.zNode(yEnd));
      const beam = bar(ref, a, b, reduction(front.spec), 0);
      steps.push(placeStep(beam, label));
      front.members.push(ref);
      if (g.slope) steps.push(headCutOnPlane(ref, wall, "testa-fine"));
      steps.push({ kind: "hardware", code: wallCode(), pieces: [ref], anchor: "testa" });
    };
    for (let j = 0; j < g.ny; j++)
      for (let i = 0; i <= g.nx; i++) yBar(`trave-y-${i}-${j}`, g.xs[i], nodeAt.get(key(i, j))!, nodeAt.get(key(i, j + 1)), "trave");

    // traversi: in ogni campata X, innestati con giunti 3 vie lineari sulle travi X attraversate
    const traverses = Math.max(1, Math.ceil(g.bayX / ctx.num("interasseTraversi") - 1e-9)) - 1;
    const line = jointSpec("3L", s, 90, "sezioneAsta", g.sectionValue);
    for (let i = 0; i < g.nx; i++)
      for (let k = 1; k <= traverses; k++) {
        const x = g.xs[i] + (k * g.bayX) / (traverses + 1);
        const rows: (NodeInfo | undefined)[] = [];
        for (let j = 0; j <= g.ny; j++) {
          if (j === g.wallRow) {
            rows.push(undefined);
            continue;
          }
          const beam = xBeams[j][i];
          const along = x - g.xs[i] - reduction(nodeAt.get(key(i, j))!.spec);
          if (along <= NODE_REACH + TRAVERSE_MARGIN || beam.length - along <= NODE_REACH + TRAVERSE_MARGIN)
            throw new ParamError("interasseTraversi", ctx.num("interasseTraversi"), `traverso a ${Math.round(along)} mm dalla testa della trave: troppo vicino al giunto d'angolo`);
          const node = { point: vec3(x, g.ys[j], g.zNode(g.ys[j])), spec: line, members: [beam.ref] };
          nodes.push(node);
          rows.push(node);
        }
        for (let j = 0; j < g.ny; j++) yBar(`traverso-${i}-${k}-${j}`, x, rows[j]!, rows[j + 1], "traverso");
      }

    // giunti: voce verificata sulle aste convergenti
    for (const n of nodes) steps.push({ kind: "hardware", code: n.spec.code, pieces: n.members, params: { point: n.point } });
    return steps;
  },

  meta(ctx) {
    const g = geometry(ctx);
    return {
      forma: g.forma,
      fissaggio: g.fissaggio,
      sezioneAsta: g.sectionValue,
      pendenza: g.slope,
      rialzoFilaAlta: g.P * g.t,
      interasseX: g.bayX,
      interasseY: g.bayY,
    };
  },
};
