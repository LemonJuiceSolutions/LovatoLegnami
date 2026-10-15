import { sectionLabel } from "../../components/sections";
import type { Section } from "../../components/types";
import { findHardware, hardwareFor } from "../../hardware/catalog";
import type { HardwareSpec } from "../../hardware/types";
import { applyToPoint, axisOf, degToRad, fromBasis, invertRigid, radToDeg } from "../../math/mat4";
import { type Plane, intersectLinePlane, plane } from "../../math/plane";
import { type Vec3, add, cross, dot, norm, normalize, scale, sub, vec3 } from "../../math/vec3";
import { ParamError, type BuildContext, type BuildStep, type TypologyTemplate } from "../template";
import {
  type GroundAnchor,
  type Placed,
  columnStep,
  constructionOf,
  constructionParam,
  enumParam,
  groundAnchor,
  groundAnchorParam,
  headCutOnPlane,
  joistScrewFor,
  numberParam,
  placeStep,
  sectionParam,
} from "./shared";

/** Il monaco scende sotto la quota più bassa delle teste dei cantonali (mm, monaco "pendente"). DA VALIDARE CON UFFICIO TECNICO. */
const MONACO_DROP = 150;
/** Tenone del pilastro d'angolo nella trave inferiore del mezzo legno (mm, < h/2 della trave). DA VALIDARE CON UFFICIO TECNICO. */
const CORNER_TENON = 35;
/** Viti di collegamento dove non c'è un giunto di catalogo (testa pilastro, trave a battuta, cantonale sul monaco). DA VALIDARE CON UFFICIO TECNICO. */
const SCREWS = { code: "vite-8x240", count: 2 } as const;
/** Gioco tra arcareccio e monaco/cuspide e margine dei calcoli d'ingombro (mm). */
const MARGIN = 10;
/** Gioco tra le teste di due elementi sulla stessa faccia del monaco (mm, per lato). */
const FACE_GAP = 2;
/** Distanza dei grigliati dal pavimento (mm). DA VALIDARE CON UFFICIO TECNICO. */
const GRID_GAP = 100;
/** Spessore dei pannelli grigliati (mm, ricerca T-I: telaio 30×42). */
const GRID_THICKNESS = 30;

type Mode = "bullonata" | "carpenteria";

const bolted0 = (ctx: BuildContext): boolean => constructionOf(ctx) === "bullonata";

const up = vec3(0, 0, 1);
const plan = (v: Vec3): Vec3 => vec3(v.x, v.y, 0);
const angleOf = (v: Vec3): number => Math.atan2(v.y, v.x);
const dir = (a: number): Vec3 => vec3(Math.cos(a), Math.sin(a), 0);

/** Elemento di falda (cantonale o puntone intermedio) dall'angolo/metà lato verso la punta. */
interface RafterDef {
  readonly ref: string;
  readonly type: "cantonale" | "puntone";
  /** Punto della linea d'intradosso al piede (sull'asse del pilastro o del lato, quota estradosso travi). */
  readonly foot: Vec3;
  /** Punto della linea d'intradosso in punta (sulla verticale della punta/estremo del colmo). */
  readonly top: Vec3;
  /** Pezzi che lo sostengono al piede (per il becco d'uccello in carpenteria). */
  readonly seatOn: readonly Placed[];
}

/**
 * Geometria del gazebo a padiglione (E5, ricerca T-H/T-I):
 *
 * - `lati` 4 (base `larghezza × profondita`, rettangolare ammessa solo in
 *   carpenteria) o 6/8 (poligono regolare di diametro circoscritto
 *   `larghezza`, un lato sul fronte y = 0); vertici = assi dei pilastri
 *   d'angolo, travi perimetrali sui lati (intradosso `altezza`);
 * - falde piane per ogni lato a pendenza α (imposta dalla cuspide se la punta
 *   è metallica), linee d'intradosso dei cantonali sulle intersezioni delle
 *   falde: pendenza `atan(tan α · cos(π/lati))`; per 4 lati con `falde` =
 *   `doppie` puntoni intermedi a metà lato (pendenza α);
 * - punta: cuspide (teste a squadra all'ingombro della cuspide, piastre 914 in
 *   testa e 915 al piede) o monaco quadrato con le teste tagliate
 *   (`headCutFromPlane`) sulla faccia del monaco più vicina (taglio composto);
 *   base rettangolare: 2 monaci alle estremità del colmo, uniti dal colmo;
 * - angoli: 4 lati bullonata = giunto 916 (aste a filo del nodo); 4 lati
 *   carpenteria = travi incrociate a mezzo legno con sporgenza e tenone del
 *   pilastro nella trave inferiore; 6/8 lati = trave che passa sul pilastro
 *   (tenone in carpenteria, viti in bullonata) e trave adiacente a battuta sul
 *   suo fianco (taglio composto, viti).
 */
function geometry(ctx: BuildContext) {
  const N = Number(ctx.enum("lati"));
  const mode = constructionOf(ctx) as Mode;
  const W = ctx.num("larghezza");
  const D = N === 4 ? ctx.num("profondita") : W;
  const H = ctx.num("altezza");
  const rect = N === 4 && Math.abs(W - D) > 1e-9;
  const doubled = N === 4 && ctx.enum("falde") === "doppie";
  const slopesCount = doubled ? 2 * N : N;
  const punta = mode === "carpenteria" ? "monaco" : (ctx.enum("punta") as "cuspide" | "monaco");
  if (rect && punta === "cuspide")
    throw new ParamError("profondita", D, "la cuspide metallica richiede una base quadrata: usare profondità = larghezza o la costruzione in carpenteria (2 monaci e colmo)");
  if (rect && mode === "bullonata")
    throw new ParamError("costruzione", mode, "la base rettangolare (colmo tra due monaci) è prevista solo in carpenteria");
  if (rect && doubled) throw new ParamError("falde", "doppie", "i puntoni intermedi sono previsti solo su base quadrata");
  let cusp: HardwareSpec | undefined;
  if (punta === "cuspide") {
    cusp = hardwareFor("cuspide").find((s) => s.slopes === slopesCount);
    if (!cusp) throw new ParamError("punta", punta, `nessuna cuspide a ${slopesCount} falde a catalogo`);
  }
  const slope = cusp ? cusp.angle! : ctx.num("pendenza");
  const t = Math.tan(degToRad(slope));

  // vertici (CCW, lato 0 sul fronte) e centro
  let V: Vec3[];
  let O: Vec3;
  // margine tra gli assi d'angolo e l'origine: la pianta (pilastri, sporgenze delle travi, piedi dei
  // cantonali) resta nel quadrante positivo, come le altre tipologie (ingombro e adattamento)
  const sp = ctx.section("sezionePilastro");
  const sb = ctx.section("sezioneTrave");
  const half0 = Math.max(sp.b, sp.h) / 2;
  const pad = N === 4 ? (mode === "carpenteria" ? Math.max(ctx.num("sporgenzaAngoli"), half0) : half0) : half0 * Math.SQRT2 + sb.b + 50;
  if (N === 4) {
    V = [vec3(pad, pad, 0), vec3(pad + W, pad, 0), vec3(pad + W, pad + D, 0), vec3(pad, pad + D, 0)];
    O = vec3(pad + W / 2, pad + D / 2, 0);
  } else {
    const rho = W / 2;
    const th = Array.from({ length: N }, (_, k) => -Math.PI / 2 - Math.PI / N + (2 * Math.PI * k) / N);
    const cx = rho * Math.max(...th.map((a) => Math.abs(Math.cos(a))));
    O = vec3(pad + cx, pad + rho * Math.cos(Math.PI / N), 0);
    V = th.map((a) => add(O, scale(dir(a), rho)));
  }
  const sides = V.map((v, k) => {
    const w = V[(k + 1) % N];
    const d = normalize(sub(w, v));
    const nIn = vec3(-d.y, d.x, 0); // verso l'interno (poligono CCW)
    return { from: v, to: w, d, nIn, length: norm(sub(w, v)) };
  });
  const half = Math.min(W, D) / 2; // distanza in pianta dalla gronda alla punta/colmo
  const rafterSlope = radToDeg(Math.atan(t * Math.cos(Math.PI / N)));
  return { N, mode, W, D, H, rect, doubled, slopesCount, punta, cusp, slope, t, V, O, sides, half, rafterSlope };
}

type Geometry = ReturnType<typeof geometry>;

/** Posa di un elemento lungo la linea d'intradosso da `a` a `b`: asse X in salita, Z nel piano verticale. */
function rafterFrame(a: Vec3, b: Vec3) {
  const X = normalize(sub(b, a));
  const Z = normalize(sub(up, scale(X, X.z)));
  return { X, Z };
}

/** Punto del piano verticale per `foot` lungo `X` in cui la retta `p0 + s·dir` lo attraversa. */
function crossVertical(foot: Vec3, X: Vec3, p0: Vec3, d: Vec3): { point: Vec3; s: number } | undefined {
  const n = normalize(cross(X, up));
  const den = dot(d, n);
  if (Math.abs(den) < 1e-9) return undefined;
  const s = dot(sub(foot, p0), n) / den;
  return { point: add(p0, scale(d, s)), s };
}

/**
 * Spigolo superiore a valle del supporto nel piano verticale dell'elemento:
 * il più esterno (in discesa) tra gli spigoli superiori dei pezzi `seatOn`.
 */
function downhillEdge(foot: Vec3, X: Vec3, seatOn: readonly Placed[]): Vec3 | undefined {
  const Xp = normalize(plan(X));
  let best: { p: Vec3; u: number } | undefined;
  for (const s of seatOn) {
    const sx = axisOf(s.pose, 0);
    for (const y of [-s.section.b / 2, s.section.b / 2]) {
      const p0 = applyToPoint(s.pose, vec3(0, y, s.section.h / 2));
      const hit = crossVertical(foot, X, p0, sx);
      if (!hit || hit.s < -1e-6 || hit.s > s.length + 1e-6) continue;
      const u = dot(sub(plan(hit.point), plan(foot)), Xp);
      if (!best || u < best.u) best = { p: hit.point, u };
    }
  }
  return best?.p;
}

/** Piano di falda del lato `k` traslato verticalmente di `dz`. */
function faldaPlane(g: Geometry, k: number, z0: number, dz: number): Plane {
  const s = g.sides[k];
  return plane(vec3(s.from.x, s.from.y, z0 + dz), vec3(-g.t * s.nIn.x, -g.t * s.nIn.y, 1));
}

export const gazeboPadiglione: TypologyTemplate = {
  slug: "gazebo-padiglione",
  name: "Gazebo a padiglione",
  description:
    "Gazebo a 4, 6 o 8 lati con travi perimetrali, cantonali dagli angoli alla punta (cuspide metallica o monaco), puntoni intermedi, arcarecci e grigliati opzionali.",
  category: "gazebo",
  tags: ["gazebo", "padiglione", "cuspide", "monaco", "cantonali", "esagonale", "ottagonale", "grigliato"],
  reference: "T-H/T-I",
  params: [
    enumParam("lati", "Lati", [["4", "4 lati"], ["6", "6 lati (esagono)"], ["8", "8 lati (ottagono)"]], "4"),
    numberParam("larghezza", "Larghezza / diametro", "mm", 2000, 8000, 3100, 10, {
      description: "4 lati: interasse dei pilastri lungo il fronte; 6/8 lati: diametro del cerchio per gli assi dei pilastri.",
    }),
    numberParam("profondita", "Profondità", "mm", 2000, 8000, 3100, 10, {
      visibleWhen: (p) => p.lati === "4",
      description: "Interasse dei pilastri in profondità (base rettangolare solo in carpenteria).",
    }),
    numberParam("altezza", "Altezza sotto trave", "mm", 1800, 3500, 2400, 10, { description: "Intradosso delle travi perimetrali." }),
    enumParam(
      "falde",
      "Falde",
      [
        ["lati", "Una per lato", "Solo cantonali."],
        ["doppie", "Doppie (8 su base quadrata)", "Cantonali e puntoni intermedi a metà lato."],
      ],
      "lati",
      { visibleWhen: (p) => p.lati === "4" },
    ),
    constructionParam("bullonata", {
      description: "Bullonata: ferramenta GAZEBO (giunti 916, cuspide e piastre). Carpenteria: tenoni, mezzo legno, monaco con tagli composti.",
    }),
    enumParam(
      "punta",
      "Punta",
      [
        ["cuspide", "Cuspide metallica", "Pendenza imposta dalla cuspide; base quadrata o poligono regolare."],
        ["monaco", "Monaco in legno", "Teste dei cantonali tagliate sulle facce del monaco."],
      ],
      "cuspide",
      { visibleWhen: (p) => p.costruzione === "bullonata" },
    ),
    numberParam("pendenza", "Pendenza delle falde", "°", 10, 40, 25, 0.5, {
      visibleWhen: (p) => p.costruzione === "carpenteria" || p.punta === "monaco",
    }),
    numberParam("montantiIntermedi", "Montanti intermedi per lato", "n", 0, 3, 0, 1, { integer: true }),
    numberParam("arcarecci", "Interasse arcarecci (0 = nessuno)", "mm", 0, 1200, 0, 10, {
      description: "Arcarecci paralleli alla gronda sopra i cantonali, interasse in pianta.",
    }),
    numberParam("grigliati", "Lati con grigliato", "n", 0, 8, 0, 1, { integer: true, description: "Pannelli grigliati tra i pilastri sui primi lati." }),
    numberParam("altezzaGrigliato", "Altezza grigliati", "mm", 500, 2400, 1800, 10, { visibleWhen: (p) => (p.grigliati as number) > 0 }),
    numberParam("sporgenzaAngoli", "Sporgenza delle travi agli angoli", "mm", 100, 500, 150, 10, {
      visibleWhen: (p) => p.costruzione === "carpenteria" && p.lati === "4",
      description: "Prolungamento delle travi oltre l'asse dei pilastri d'angolo (mezzo legno).",
    }),
    groundAnchorParam("bicchiere"),
    sectionParam("sezionePilastro", "Sezione pilastri", "pilastro", "90×90"),
    sectionParam("sezioneTrave", "Sezione travi perimetrali", "trave", "90×90"),
    {
      ...sectionParam("sezioneCantonale", "Sezione cantonali e puntoni (ferramenta GAZEBO)", "cantonale", "70×70"),
      visibleWhen: (p) => p.costruzione === "bullonata",
      description: "Le piastre 914/915 sono per puntoni 70×70.",
    },
    {
      ...sectionParam("sezioneCantonaleCarpenteria", "Sezione cantonali e puntoni (carpenteria)", "cantonale", "90×90"),
      visibleWhen: (p) => p.costruzione === "carpenteria",
    },
    { ...sectionParam("sezioneMonaco", "Sezione monaco", "monaco", "250×250"), visibleWhen: (p) => p.costruzione === "carpenteria" || p.punta === "monaco" },
    { ...sectionParam("sezioneColmo", "Sezione colmo", "colmo", "120×120"), visibleWhen: (p) => p.lati === "4" && p.larghezza !== p.profondita },
    { ...sectionParam("sezioneArcareccio", "Sezione arcarecci", "travetto", "45×90"), visibleWhen: (p) => (p.arcarecci as number) > 0 },
  ],

  build(ctx) {
    const g = geometry(ctx);
    const sp = ctx.section("sezionePilastro");
    const sb = ctx.section("sezioneTrave");
    const sc = ctx.section(bolted0(ctx) ? "sezioneCantonale" : "sezioneCantonaleCarpenteria");
    const bolted = g.mode === "bullonata";
    const z0 = g.H + sb.h; // estradosso delle travi: quota della gronda delle falde
    const steps: BuildStep[] = [];
    const screws = (pieces: string[]) => steps.push({ kind: "hardware", code: SCREWS.code, pieces, params: { count: SCREWS.count } });

    // --- pilastri e travi perimetrali -------------------------------------------------------
    const joint916 = g.N === 4 && bolted;
    if (joint916 && (sp.b !== 90 || sp.h !== 90 || sb.b !== 90 || sb.h !== 90))
      throw new ParamError("sezionePilastro", sectionLabel(sp), "il giunto angolare 916 collega pilastri e travi 90×90");
    const node916 = findHardware("giunto-gazebo-916");
    const r916 = node916.joint!.node / 2 - node916.joint!.insertion;
    const tenonOf = (len: number) => ({ width: Math.round(sp.b / 3), height: Math.round((2 * sp.h) / 3), length: len, gap: 1 });
    const sideTenon = Math.min(60, sb.h / 2);

    const posts: Placed[] = [];
    const placePost = (ref: string, p: Vec3, across: Vec3, top: number) => {
      const step = columnStep(ctx, ref, p.x, p.y, top, sp, across);
      const placed: Placed = { ref, type: "pilastro", section: sp, length: step.length as number, pose: step.pose as Placed["pose"] };
      posts.push(placed);
      steps.push(placeStep(placed));
      return placed;
    };
    const beamAlong = (ref: string, a: Vec3, d: Vec3, length: number): Placed => ({
      ref,
      type: "trave",
      section: sb,
      length,
      pose: fromBasis(vec3(a.x, a.y, g.H + sb.h / 2), d, up),
    });

    const beams: Placed[] = [];
    const cornerPosts: Placed[] = [];
    if (g.N === 4) {
      const cornerTop = bolted ? g.H + sb.h / 2 - r916 : g.H + CORNER_TENON;
      g.V.forEach((v, k) => cornerPosts.push(placePost(`pilastro-${k}`, v, vec3(0, 1, 0), cornerTop)));
      const e = bolted ? -r916 : ctx.num("sporgenzaAngoli");
      g.sides.forEach((s, k) => {
        const b = beamAlong(`trave-${k}`, sub(s.from, scale(s.d, e)), s.d, s.length + 2 * e);
        beams.push(b);
        steps.push(placeStep(b));
      });
      g.V.forEach((v, k) => {
        const [prev, next] = [beams[(k + g.N - 1) % g.N], beams[k]];
        if (bolted) {
          steps.push({ kind: "hardware", code: node916.code, pieces: [cornerPosts[k].ref, prev.ref, next.ref], params: { point: vec3(v.x, v.y, g.H + sb.h / 2) } });
        } else {
          // la trave lungo X è quella inferiore del mezzo legno (tasca superiore) e riceve il tenone del pilastro
          const [lower, upper] = Math.abs(axisOf(prev.pose, 0).x) > 0.5 ? [prev, next] : [next, prev];
          steps.push(
            { kind: "joint", type: "mezzo-legno", a: lower.ref, b: upper.ref },
            { kind: "joint", type: "tenone-mortasa", a: cornerPosts[k].ref, b: lower.ref, params: tenonOf(CORNER_TENON) },
          );
        }
      });
    } else {
      // 6/8 lati: la trave k passa sul pilastro k, la trave k−1 arriva a battuta sul suo fianco interno
      const innerFace = (k: number): Plane => {
        const s = g.sides[k];
        return plane(add(s.from, scale(s.nIn, sb.b / 2)), s.nIn);
      };
      const edgeHits = (k: number, face: Plane, ref: Vec3): number[] => {
        const s = g.sides[k];
        return [-sb.b / 2, sb.b / 2].map((o) => {
          const p0 = add(s.from, scale(s.nIn, o));
          return dot(sub(intersectLinePlane(p0, s.d, face).point, ref), s.d);
        });
      };
      g.V.forEach((v, k) => {
        const s = g.sides[k];
        cornerPosts.push(placePost(`pilastro-${k}`, v, s.d, bolted ? g.H : g.H + sideTenon));
        const prevK = (k + g.N - 1) % g.N;
        const back = Math.max(sp.b / Math.SQRT2, -Math.min(...edgeHits(prevK, innerFace(k), v))) + MARGIN;
        const nextFace = innerFace((k + 1) % g.N);
        const fwd = Math.max(0, ...edgeHits(k, nextFace, s.to)) + MARGIN;
        const b = beamAlong(`trave-${k}`, sub(v, scale(s.d, back)), s.d, back + s.length + fwd);
        beams.push(b);
        steps.push(placeStep(b), headCutOnPlane(b.ref, nextFace, "testa-fine"));
      });
      g.V.forEach((_, k) => {
        if (bolted) screws([cornerPosts[k].ref, beams[k].ref]);
        else steps.push({ kind: "joint", type: "tenone-mortasa", a: cornerPosts[k].ref, b: beams[k].ref, params: tenonOf(sideTenon) });
        screws([beams[(k + g.N - 1) % g.N].ref, beams[k].ref]);
      });
    }

    // montanti intermedi sotto le travi
    const nm = ctx.num("montantiIntermedi");
    g.sides.forEach((s, k) => {
      for (let j = 1; j <= nm; j++) {
        const p = add(s.from, scale(s.d, (j * s.length) / (nm + 1)));
        const post = placePost(`montante-${k}-${j}`, p, g.N === 4 ? vec3(0, 1, 0) : s.d, bolted ? g.H : g.H + sideTenon);
        if (bolted) screws([post.ref, beams[k].ref]);
        else steps.push({ kind: "joint", type: "tenone-mortasa", a: post.ref, b: beams[k].ref, params: tenonOf(sideTenon) });
      }
    });

    // --- cantonali e puntoni intermedi ------------------------------------------------------
    const zTop = z0 + g.half * g.t; // quota d'intradosso in punta / al colmo
    const rafters: RafterDef[] = [];
    const sgn = (v: number) => (v > 1e-9 ? 1 : v < -1e-9 ? -1 : 0);
    g.V.forEach((v, k) => {
      let top: Vec3;
      if (g.N === 4) {
        const inward = vec3(sgn(g.O.x - v.x), sgn(g.O.y - v.y), 0);
        top = add(v, scale(inward, g.half));
      } else top = g.O;
      const seatOn = g.N === 4 ? [beams[(k + g.N - 1) % g.N], beams[k]] : [beams[k]];
      rafters.push({ ref: `cantonale-${k}`, type: "cantonale", foot: vec3(v.x, v.y, z0), top: vec3(top.x, top.y, zTop), seatOn });
    });
    if (g.doubled)
      g.sides.forEach((s, k) => {
        const m = add(s.from, scale(s.d, s.length / 2));
        rafters.push({ ref: `puntone-${k}`, type: "puntone", foot: vec3(m.x, m.y, z0), top: vec3(g.O.x, g.O.y, zTop), seatOn: [beams[k]] });
      });

    // monaci: centro, rotazione e facce
    const sm = ctx.section("sezioneMonaco");
    const msz = sm.b;
    if (g.punta === "monaco" && sm.b !== sm.h) throw new ParamError("sezioneMonaco", sectionLabel(sm), "il monaco deve avere sezione quadrata");
    interface Monaco {
      ref: string;
      center: Vec3;
      theta: number;
    }
    const monaci: Monaco[] = [];
    let ridge: { a: Vec3; b: Vec3; d: Vec3 } | undefined;
    if (g.punta === "monaco") {
      if (g.rect) {
        const r = Math.abs(g.W - g.D) / 2;
        const [ta, tb] = g.W > g.D ? [vec3(g.O.x - r, g.O.y, 0), vec3(g.O.x + r, g.O.y, 0)] : [vec3(g.O.x, g.O.y - r, 0), vec3(g.O.x, g.O.y + r, 0)];
        const d = normalize(sub(tb, ta));
        ridge = { a: ta, b: tb, d };
        monaci.push({ ref: "monaco-0", center: sub(ta, scale(d, msz / 2)), theta: angleOf(d) }, { ref: "monaco-1", center: add(tb, scale(d, msz / 2)), theta: angleOf(d) });
      } else {
        const a0 = angleOf(sub(g.V[0], g.O));
        monaci.push({ ref: "monaco-0", center: g.O, theta: a0 + (rafters.length === 8 ? Math.PI / 8 : 0) });
      }
    }
    const monacoFor = (r: RafterDef): Monaco => monaci.reduce((best, m) => (norm(sub(plan(r.top), m.center)) < norm(sub(plan(r.top), best.center)) ? m : best));
    /** Faccia del monaco per l'elemento: normale uscente orizzontale e piano. */
    const faceFor = (r: RafterDef, m: Monaco): { n: Vec3; plane: Plane } => {
      const out = normalize(sub(plan(r.foot), plan(r.top))); // dalla punta verso il piede
      let n: Vec3;
      if (ridge) {
        const w = vec3(-ridge.d.y, ridge.d.x, 0);
        n = dot(out, w) > 0 ? w : scale(w, -1);
      } else {
        const normals = [0, 1, 2, 3].map((i) => dir(m.theta + (i * Math.PI) / 2));
        n = normals.reduce((best, c) => (dot(c, out) > dot(best, out) + 1e-9 ? c : best));
      }
      return { n, plane: plane(add(vec3(m.center.x, m.center.y, 0), scale(n, msz / 2)), n) };
    };

    // posa degli elementi di falda
    const placedRafters: Placed[] = [];
    const tops: { r: RafterDef; zLow: number }[] = [];
    const faces = new Map<string, { monaco: string; n: Vec3; lateral: number; halfW: number }>();
    for (const r of rafters) {
      const { X, Z } = rafterFrame(r.foot, r.top);
      const sec = sc;
      const slopeR = radToDeg(Math.asin(X.z));
      // piede: in carpenteria sullo spigolo a valle del supporto (becco d'uccello e taglio a piombo),
      // in bullonata a squadra con lo spigolo inferiore sul punto d'appoggio
      let footPoint = r.foot;
      let vertex: Vec3 | undefined;
      if (!bolted) {
        vertex = downhillEdge(r.foot, X, r.seatOn);
        if (!vertex) throw new ParamError("sezioneTrave", sectionLabel(sb), `${r.ref}: nessuno spigolo d'appoggio sulle travi`);
        const u = dot(sub(plan(vertex), plan(r.foot)), normalize(plan(X))) / Math.cos(degToRad(slopeR));
        footPoint = add(r.foot, scale(X, u));
      }
      // testa: lunghezza fino all'ingombro della cuspide, oppure oltre la faccia del monaco (poi tagliata)
      let topS: number;
      const full = norm(sub(r.top, footPoint));
      if (g.cusp) {
        const reach = g.cusp.dims.z; // semidiagonale della cuspide (ricerca T-H)
        topS = full - reach / Math.cos(degToRad(slopeR));
      } else topS = full;
      if (topS <= 300) throw new ParamError("larghezza", g.W, `${r.ref} troppo corto (${Math.round(topS)} mm)`);
      const placed: Placed = { ref: r.ref, type: r.type, section: sec, length: topS, pose: fromBasis(add(footPoint, scale(Z, sec.h / 2)), X, Z) };
      placedRafters.push(placed);
      steps.push(placeStep(placed));
      if (vertex) {
        const foot = vertex;
        steps.push(headCutOnPlane(r.ref, plane(foot, normalize(plan(X))), "testa-inizio"), {
          kind: "machining",
          target: r.ref,
          fromPiece: (piece) => {
            const q = applyToPoint(invertRigid(piece.pose), foot);
            return { type: "becco-uccello", face: "inferiore", at: q.x, depth: q.z + piece.section.h / 2, angle: slopeR };
          },
        });
      } else steps.push({ kind: "hardware", code: "piastra-915", pieces: [r.ref], anchor: "piede" });
      if (g.punta === "monaco") {
        const m = monacoFor(r);
        const f = faceFor(r, m);
        steps.push(headCutOnPlane(r.ref, f.plane, "testa-fine"));
        // quote dell'elemento sulla faccia del monaco (intradosso e estradosso) e ingombro sulla faccia
        const hit = intersectLinePlane(footPoint, X, f.plane).point;
        const dev = Math.acos(Math.min(1, Math.abs(dot(normalize(plan(X)), f.n))));
        const halfW = sec.b / 2 / Math.cos(dev) + FACE_GAP;
        const lateral = dot(sub(plan(hit), add(m.center, scale(f.n, msz / 2))), vec3(-f.n.y, f.n.x, 0));
        const extra = (sec.b / 2) * Math.tan(dev) * Math.tan(degToRad(slopeR));
        tops.push({ r, zLow: hit.z - extra });
        faces.set(r.ref, { monaco: m.ref, n: f.n, lateral, halfW });
      }
    }

    // --- punta: cuspide o monaci (+ colmo) -------------------------------------------------
    const extrados = sc.h / Math.cos(degToRad(g.rafterSlope)); // spessore verticale dei cantonali
    if (g.cusp) {
      // centro della cuspide: assi dei cantonali prolungati sulla verticale della punta
      const apex = vec3(g.O.x, g.O.y, zTop + sc.h / 2 / Math.cos(degToRad(g.rafterSlope)));
      steps.push({ kind: "hardware", code: g.cusp.code, pieces: placedRafters.map((p) => p.ref), params: { point: apex } });
    } else {
      // verifica dell'ingombro delle teste sulle facce del monaco
      const byFace = new Map<string, { lateral: number; halfW: number; ref: string }[]>();
      for (const r of rafters) {
        const f = faces.get(r.ref)!;
        const key = `${f.monaco}:${Math.round(angleOf(f.n) * 1e6)}`;
        if (Math.abs(f.lateral) + f.halfW > msz / 2 + 1e-6)
          throw new ParamError("sezioneMonaco", sectionLabel(sm), `la testa di ${r.ref} esce dalla faccia del monaco: servono facce più larghe`);
        const list = byFace.get(key) ?? [];
        for (const o of list)
          if (Math.abs(o.lateral - f.lateral) < o.halfW + f.halfW)
            throw new ParamError("sezioneMonaco", sectionLabel(sm), `le teste di ${o.ref} e ${r.ref} si sovrappongono sulla faccia del monaco`);
        list.push({ lateral: f.lateral, halfW: f.halfW, ref: r.ref });
        byFace.set(key, list);
      }
      const zMonacoTop = zTop + extrados;
      // colmo (base rettangolare): estradosso con gli spigoli sui piani di falda, tra le facce interne dei monaci
      let colmo: Placed | undefined;
      if (ridge) {
        const scol = ctx.section("sezioneColmo");
        const zc = zTop + extrados - (scol.b / 2) * g.t - scol.h / 2;
        colmo = { ref: "colmo", type: "colmo", section: scol, length: norm(sub(ridge.b, ridge.a)), pose: fromBasis(vec3(ridge.a.x, ridge.a.y, zc), ridge.d, up) };
      }
      for (const m of monaci) {
        const mine = tops.filter((x) => monacoFor(x.r) === m);
        const zLow = Math.min(...mine.map((x) => x.zLow), ...(colmo ? [colmo.pose[11] - colmo.section.h / 2] : [])) - MONACO_DROP;
        const length = zMonacoTop - zLow;
        const pose = fromBasis(vec3(m.center.x, m.center.y, zLow), up, dir(m.theta));
        const placed: Placed = { ref: m.ref, type: "monaco", section: sm, length, pose };
        steps.push(placeStep(placed));
        // punta: falde (estradosso dei cantonali) che passano sopra il monaco
        g.sides.forEach((_, k) => {
          const pl = faldaPlane(g, k, z0, extrados);
          const zAt = pl.point.z - (pl.normal.x * (m.center.x - pl.point.x) + pl.normal.y * (m.center.y - pl.point.y)) / pl.normal.z;
          if (zAt <= zMonacoTop + 1e-6) steps.push(headCutOnPlane(m.ref, pl, "testa-fine"));
        });
        for (const x of mine) screws([x.r.ref, m.ref]);
      }
      if (colmo) {
        steps.push(placeStep(colmo));
        for (const m of monaci) screws([colmo.ref, m.ref]);
      }
    }

    // --- arcarecci ---------------------------------------------------------------------------
    const pitch = ctx.num("arcarecci");
    if (pitch > 0) {
      const sa = ctx.section("sezioneArcareccio");
      const hips = placedRafters.filter((p) => p.type === "cantonale");
      // limite verso la punta: ingombro della cuspide o del monaco (in pianta, dalla linea di colmo/punta)
      const topReach = g.cusp ? g.cusp.dims.z : msz / Math.SQRT2;
      g.sides.forEach((s, k) => {
        const [hA, hB] = [hips[k], hips[(k + 1) % g.N]];
        const usable = g.half - topReach - sa.b - MARGIN;
        if (usable <= sa.b) return;
        const n = Math.max(1, Math.ceil(usable / pitch - 1e-9));
        // piano d'appoggio: parallelo alla falda per lo spigolo superiore del cantonale dal lato della falda
        const edge = (h: Placed): Vec3 => {
          const y = dot(axisOf(h.pose, 1), s.nIn) < 0 ? h.section.b / 2 : -h.section.b / 2;
          return applyToPoint(h.pose, vec3(h.length / 2, y, h.section.h / 2));
        };
        const nf = normalize(vec3(-g.t * s.nIn.x, -g.t * s.nIn.y, 1));
        const seat = plane(edge(hA), nf);
        const hipPlane = (h: Placed): Plane => plane(applyToPoint(h.pose, vec3(0, 0, 0)), normalize(cross(axisOf(h.pose, 0), up)));
        for (let i = 1; i <= n; i++) {
          const delta = (i * usable) / n;
          const ref = `arcareccio-${k}-${i}`;
          // asse: in pianta a `delta` dalla gronda, faccia inferiore sul piano d'appoggio
          const p0 = add(s.from, scale(s.nIn, delta));
          const zSeat = seat.point.z - (seat.normal.x * (p0.x - seat.point.x) + seat.normal.y * (p0.y - seat.point.y)) / seat.normal.z;
          const axis0 = add(vec3(p0.x, p0.y, zSeat), scale(nf, sa.h / 2));
          const a = intersectLinePlane(axis0, s.d, hipPlane(hA)).t;
          const b = intersectLinePlane(axis0, s.d, hipPlane(hB)).t;
          const ext = sa.b + sa.h;
          const origin = add(axis0, scale(s.d, a - ext));
          const placed: Placed = { ref, type: "travetto", section: sa, length: b - a + 2 * ext, pose: fromBasis(origin, s.d, nf) };
          steps.push(placeStep(placed, "arcareccio"), headCutOnPlane(ref, hipPlane(hA), "testa-inizio"), headCutOnPlane(ref, hipPlane(hB), "testa-fine"));
          if (bolted) {
            steps.push({ kind: "hardware", code: "supporto-arcarecci-170", pieces: [ref, hA.ref], anchor: "piede" });
            steps.push({ kind: "hardware", code: "supporto-arcarecci-170", pieces: [ref, hB.ref], anchor: "testa" });
          } else steps.push({ kind: "hardware", code: joistScrewFor(sa), pieces: [ref, hA.ref, hB.ref], params: { count: 2 } });
        }
      });
    }

    // --- grigliati tra i pilastri dei primi lati ---------------------------------------------
    const nGrid = Math.min(ctx.num("grigliati"), g.N);
    if (nGrid > 0) {
      const hg = ctx.num("altezzaGrigliato");
      if (GRID_GAP + hg > g.H) throw new ParamError("altezzaGrigliato", hg, `il grigliato supera l'intradosso delle travi (${g.H} mm)`);
      for (let k = 0; k < nGrid; k++) {
        const s = g.sides[k];
        for (let j = 0; j <= nm; j++) {
          const a = (j * s.length) / (nm + 1) + sp.b / 2;
          const b = ((j + 1) * s.length) / (nm + 1) - sp.b / 2;
          const p = add(s.from, scale(s.d, a));
          const floor = ctx.floorHeightAt(p.x, p.y);
          const sec: Section = { b: GRID_THICKNESS, h: hg };
          steps.push(placeStep({ ref: `grigliato-${k}-${j}`, type: "grigliato", section: sec, length: b - a, pose: fromBasis(vec3(p.x, p.y, floor + GRID_GAP + hg / 2), s.d, up) }));
        }
      }
    }

    const anchor = ctx.enum("ancoraggioTerra") as GroundAnchor;
    for (const p of posts) steps.push(...groundAnchor(ctx, anchor, p.ref, sp));
    return steps;
  },

  meta(ctx) {
    const g = geometry(ctx);
    return {
      lati: g.N,
      falde: g.slopesCount,
      costruzione: g.mode,
      punta: g.punta,
      pendenza: g.slope,
      originePendenza: g.cusp ? "ferramenta" : "parametro",
      pendenzaCantonali: g.rafterSlope,
      ...(g.cusp ? { cuspide: g.cusp.code } : {}),
      ...(g.rect ? { colmo: Math.abs(g.W - g.D) } : {}),
      ...(g.punta === "monaco" && g.N !== 4 ? { approssimazioni: "monaco a sezione quadrata su pianta poligonale" } : {}),
    };
  },
};
