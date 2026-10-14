import { arcLength, arcPoint } from "../../math/arc";
import { applyToPoint, degToRad, fromBasis, invertRigid, radToDeg } from "../../math/mat4";
import { plane } from "../../math/plane";
import { vec3 } from "../../math/vec3";
import { BOLT_STEP_CODE, ParamError, type BuildContext, type BuildStep, type TypologyTemplate } from "../template";
import {
  type GroundAnchor,
  type JoistLine,
  type Placed,
  type PortalResult,
  beamOnPosts,
  groundAnchor,
  groundAnchorCode,
  groundAnchorParam,
  headCutOnPlane,
  joistSpaces,
  joistsOnBeams,
  numberParam,
  placeStep,
  sectionParam,
  spread,
} from "./shared";

/** Gioco minimo tra l'estradosso dell'arco e il fianco del pilastro anteriore (mm). */
const ARC_POST_CLEARANCE = 5;
/** Bulloni M8 in testa all'arco: distanze dalla testa lungo l'asse (mm). DA VALIDARE CON UFFICIO TECNICO. */
const HEAD_BOLTS = [80, 240] as const;
/** Diametro dei bulloni in testa all'arco (ricerca T-E: 8×120/8×140). DA VALIDARE CON UFFICIO TECNICO. */
const HEAD_BOLT_DIAMETER = 8;
/** Interasse minimo tra due portali e tra i due pilastri di un portale (mm). */
const MIN_BAY = 800;

/**
 * Arco con testa orizzontale in `head` (asse della sandwich) e piede che
 * appoggia sul pavimento a quota `floor` con un taglio orizzontale (E5).
 * Il cerchio dell'asse ha centro sulla verticale della testa a quota
 * `head.z − R`; l'angolo ψ tra testa e piede (lo `sweep`) è tale che lo
 * spigolo più alto della testa di piede, ortogonale all'asse, stia sul
 * pavimento: R(1 − cos ψ) = D + (h/2)|cos ψ|, con D = head.z − floor, cioè
 * cos ψ = (R − D)/(R − h/2) se D > R (piede inclinato verso il pilastro, ψ > 90°),
 * (R − D)/(R + h/2) altrimenti. Il taglio di piede a filo pavimento asporta il
 * cuneo sotto il pavimento.
 */
export function solveArch(R: number, h: number, D: number): { sweep: number; minRadius: number } {
  const minRadius = (D + h / 2) / 2;
  if (R < minRadius - 1e-9) return { sweep: NaN, minRadius };
  const c = D > R ? (R - D) / (R - h / 2) : (R - D) / (R + h / 2);
  return { sweep: radToDeg(Math.acos(Math.max(-1, Math.min(1, c)))), minRadius };
}

/**
 * Geometria del carport ad arco (E5, ricerca T-E):
 *
 * - `campate + 1` portali sandwich lungo Y (tavole lunghe `profondita`, fronte
 *   d'ingresso in y = 0), distribuiti lungo X con le teste dei travetti a
 *   `sbalzo` dagli assi dei portali d'estremità; 2 pilastri per portale: il
 *   primo a `sbalzoFrontale` dal fronte, il secondo a `sbalzoPosteriore` dal
 *   retro (pilastri su `profondita − sbalzoFrontale`);
 * - per ogni portale un `arco` (sezione = `sezionePilastro`, raggio
 *   `raggioArco`) nel piano del portale, tra le tavole: testa orizzontale a
 *   filo del fronte con l'asse sull'asse della sandwich, 2 bulloni passanti M8
 *   tavola–arco–tavola; piede sul pavimento davanti al pilastro con taglio
 *   orizzontale e staffa a P greco; `sweep` da `solveArch` (≈ 93° per R 2400
 *   e intradosso 2465, sviluppo ≈ 3900);
 * - travetti lungo X sopra le tavole (appoggio avvitato), controventi 750
 *   opzionali tra i due pilastri di ogni portale.
 */
function geometry(ctx: BuildContext) {
  const W = ctx.num("larghezza");
  const P = ctx.num("profondita");
  const H = ctx.num("altezza");
  const campate = ctx.num("campate");
  const lateral = ctx.num("sbalzo");
  const front = ctx.num("sbalzoFrontale");
  const back = ctx.num("sbalzoPosteriore");
  const R = ctx.num("raggioArco");
  const sp = ctx.section("sezionePilastro");
  const plank = ctx.section("sezioneTavola");
  const bay = (W - 2 * lateral) / campate;
  if (bay < MIN_BAY) throw new ParamError("sbalzo", lateral, `interasse dei portali di ${Math.round(bay)} mm: servono almeno ${MIN_BAY} mm`);
  if (P - front - back < MIN_BAY)
    throw new ParamError("sbalzoFrontale", front, `interasse dei pilastri di ${Math.round(P - front - back)} mm: servono almeno ${MIN_BAY} mm`);
  const portalXs = Array.from({ length: campate + 1 }, (_, k) => lateral + k * bay);
  const zHead = H + plank.h / 2;
  return { W, P, H, campate, lateral, front, back, R, sp, plank, bay, portalXs, zHead };
}

/** Arco del portale in `x`: sweep, posa e controlli di raggio e ingombro. */
function arch(ctx: BuildContext, g: ReturnType<typeof geometry>, x: number) {
  const h = g.sp.h;
  // pavimento al piede: due iterazioni (la posizione del piede dipende dallo sweep)
  let floor = ctx.floorHeightAt(x, g.front);
  let s = solveArch(g.R, h, g.zHead - floor);
  for (let it = 0; it < 2 && Number.isFinite(s.sweep); it++) {
    floor = ctx.floorHeightAt(x, g.R * Math.sin(degToRad(s.sweep)));
    s = solveArch(g.R, h, g.zHead - floor);
  }
  if (!Number.isFinite(s.sweep))
    throw new ParamError(
      "raggioArco",
      g.R,
      `l'arco non raggiunge la trave (${Math.round(g.zHead - floor)} mm dal pavimento all'asse della sandwich): raggio minimo ${Math.ceil(s.minRadius)} mm`,
      { min: Math.ceil(s.minRadius), max: 5000 },
    );
  const psi = degToRad(s.sweep);
  // ingombro verso il pilastro: estradosso nel punto più arretrato dell'arco
  const reach = (g.R + h / 2) * (psi >= Math.PI / 2 ? 1 : Math.sin(psi));
  const need = reach + g.sp.h / 2 + ARC_POST_CLEARANCE;
  if (need > g.front + 1e-6)
    throw new ParamError("sbalzoFrontale", g.front, `l'arco di raggio ${g.R} arretra di ${Math.round(reach)} mm dal fronte: sbalzo frontale minimo ${Math.ceil(need)} mm`, {
      min: Math.ceil(need),
      max: 3500,
    });
  // centro sulla verticale della testa; piede = C + R(sin ψ, cos ψ) nel piano (y, z)
  const C = vec3(x, 0, g.zHead - g.R);
  const foot = vec3(x, g.R * Math.sin(psi), C.z + g.R * Math.cos(psi));
  const X0 = vec3(0, -Math.cos(psi), Math.sin(psi)); // tangente al piede, verso la testa
  const Z0 = vec3(0, -Math.sin(psi), -Math.cos(psi)); // normale verso il centro
  const length = arcLength(g.R, s.sweep);
  return { sweep: s.sweep, minRadius: s.minRadius, length, floor, pose: fromBasis(foot, X0, Z0), footY: foot.y };
}

export const carportArco: TypologyTemplate = {
  slug: "carport-arco",
  name: "Carport ad arco",
  description:
    "Carport a portali sandwich con sbalzo frontale sostenuto da archi lamellari: piede a terra su staffa a P greco, testa infilata tra le tavole e bullonata.",
  category: "carport",
  tags: ["carport", "arco", "lamellare", "sbalzo", "sandwich", "bullonata", "posto auto"],
  reference: "T-E",
  params: [
    numberParam("larghezza", "Larghezza (lunghezza dei travetti)", "mm", 2000, 8000, 3000, 50),
    numberParam("profondita", "Profondità (lunghezza delle tavole)", "mm", 3000, 8000, 5000, 50),
    numberParam("altezza", "Altezza sotto trave", "mm", 1800, 3500, 2465, 5, {
      description: "Intradosso delle tavole (h 270 con tavole 45×145 e travetti 45×90).",
    }),
    numberParam("campate", "Campate", "n", 1, 4, 1, 1, { integer: true, description: "Campi tra i portali (portali = archi = campate + 1)." }),
    numberParam("interasse", "Interasse travetti desiderato", "mm", 300, 1200, 750, 10),
    numberParam("sbalzo", "Sbalzo dei travetti", "mm", 0, 1000, 90, 10, { description: "Sporgenza dei travetti oltre l'asse dei portali d'estremità." }),
    numberParam("sbalzoFrontale", "Sbalzo frontale", "mm", 1000, 3500, 2500, 10, {
      description: "Distanza tra il fronte (testa delle tavole e dell'arco) e l'asse del pilastro anteriore.",
    }),
    numberParam("sbalzoPosteriore", "Sbalzo posteriore", "mm", 100, 1500, 200, 10),
    numberParam("raggioArco", "Raggio dell'arco", "mm", 800, 5000, 2400, 10, { description: "Raggio dell'asse dell'arco lamellare." }),
    groundAnchorParam("p-greco", { label: "Ancoraggio a terra dei pilastri" }),
    { kind: "boolean", name: "controventi", label: "Controventi (saette 750)", default: false },
    sectionParam("sezionePilastro", "Sezione pilastri e archi", "pilastro", "90×90"),
    sectionParam("sezioneTavola", "Sezione tavole (sandwich)", "tavola", "45×145"),
    sectionParam("sezioneTravetto", "Sezione travetti", "travetto", "45×90"),
    { ...sectionParam("sezioneControvento", "Sezione saette", "controvento", "90×90"), visibleWhen: (p) => p.controventi === true },
  ],

  build(ctx) {
    const g = geometry(ctx);
    const sp = g.sp;
    const steps: BuildStep[] = [];
    const portals: PortalResult[] = g.portalXs.map((x, k) =>
      beamOnPosts(ctx, "bullonata", {
        prefix: `portale-${k}`,
        start: { x, y: 0 },
        dir: { x: 0, y: 1 },
        length: g.P,
        posts: [g.front, g.P - g.back],
        underside: g.H,
        postSection: sp,
        plank: g.plank,
        beam: g.plank,
        // tra i due pilastri: davanti al pilastro anteriore c'è l'arco
        braces: ctx.bool("controventi") ? { section: ctx.section("sezioneControvento"), sides: (i, side) => !(i === 0 && side < 0) } : undefined,
      }),
    );
    portals.forEach((p) => steps.push(...p.steps));

    // archi: tra le tavole di ogni portale
    const floorPlane = (z: number) => plane(vec3(0, 0, z), vec3(0, 0, 1));
    portals.forEach((p, k) => {
      const a = arch(ctx, g, g.portalXs[k]);
      const ref = `arco-${k}`;
      const placed: Placed = { ref, type: "arco", section: sp, length: a.length, pose: a.pose, curve: { radius: g.R, sweep: a.sweep } };
      steps.push(placeStep(placed), headCutOnPlane(ref, floorPlane(a.floor), "testa-inizio"));
      // bulloni M8 in testa: tavola – arco – tavola, sull'asse dell'arco
      const inv = invertRigid(p.beams[0].pose);
      for (const d of HEAD_BOLTS) {
        const q = applyToPoint(inv, applyToPoint(a.pose, arcPoint(g.R, a.length - d)));
        steps.push({
          kind: "hardware",
          code: BOLT_STEP_CODE,
          pieces: [p.beams[0].ref, ref, p.beams[1].ref],
          params: { face: "destra", at: q.x, offset: q.z, diameter: HEAD_BOLT_DIAMETER },
        });
      }
      steps.push({ kind: "hardware", code: groundAnchorCode("p-greco", sp, "sezionePilastro"), pieces: [ref], anchor: "piede" });
    });

    // travetti lungo X sopra le tavole, attestati sull'asse dei portali intermedi
    const sj = ctx.section("sezioneTravetto");
    const ys = spread(0, g.P, sj.b, joistSpaces(g.P - sj.b, ctx.num("interasse")));
    const joists: JoistLine[] = [];
    for (let k = 0; k < g.campate; k++) {
      const x0 = k === 0 ? 0 : g.portalXs[k];
      const x1 = k === g.campate - 1 ? g.W : g.portalXs[k + 1];
      ys.forEach((y, i) => joists.push({ ref: `travetto-${k}-${i}`, section: sj, from: { x: x0, y }, to: { x: x1, y } }));
    }
    steps.push(...joistsOnBeams(ctx, "bullonata", { joists, seat: portals[0].top, supports: portals.flatMap((p) => p.beams) }).steps);

    const anchor = ctx.enum("ancoraggioTerra") as GroundAnchor;
    for (const p of portals) for (const post of p.posts) steps.push(...groundAnchor(ctx, anchor, post.ref, sp));
    return steps;
  },

  meta(ctx) {
    const g = geometry(ctx);
    const a = arch(ctx, g, g.portalXs[0]);
    return {
      portali: g.portalXs.length,
      campata: g.bay,
      sweepArco: a.sweep,
      sviluppoArco: a.length,
      raggioMinimoArco: a.minRadius,
      avanzamentoArco: g.front - a.footY,
      quotaTestaArco: g.zHead,
    };
  },
};
