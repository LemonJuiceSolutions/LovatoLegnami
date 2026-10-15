import { sectionLabel } from "../../components/sections";
import type { MachiningSpec, Piece, Section } from "../../components/types";
import { hardwareFor } from "../../hardware/catalog";
import { applyToPoint, axisOf, degToRad, fromBasis, invertRigid, radToDeg } from "../../math/mat4";
import { type Plane, intersectLinePlane, plane } from "../../math/plane";
import { type Vec3, add, cross, dot, normalize, scale, sub, vec3 } from "../../math/vec3";
import { ParamError, TemplateError, type BuildContext, type BuildStep, type TypologyTemplate } from "../template";
import {
  type GroundAnchor,
  type Placed,
  WALL_SLOPE,
  type WallAttachment,
  columnStep,
  constructionOf,
  constructionParam,
  enumParam,
  groundAnchor,
  groundAnchorParam,
  headCutOnPlane,
  joistScrewFor,
  joistSpaces,
  lengthToPlane,
  numberParam,
  placeStep,
  sectionParam,
  seatOffset,
  spread,
} from "./shared";

/** Travetti di compluvio più corti di così (in pianta) non vengono posati (mm). */
const MIN_JACK = 300;
/** Viti di collegamento senza giunto di catalogo (pilastro, compluvio). DA VALIDARE CON UFFICIO TECNICO. */
const SCREWS = { code: "vite-8x240", count: 2 } as const;

const up = vec3(0, 0, 1);
const bolted = (p: Readonly<Record<string, unknown>>) => p.costruzione === "bullonata";

/** Ala: muro, direzione lungo il muro, normale uscente dal muro e lunghezza. */
interface Wing {
  readonly key: "A" | "B";
  /** Origine della coordinata lungo il muro (sul piano del muro). */
  readonly origin: Vec3;
  readonly along: Vec3;
  /** Orizzontale, dal muro verso la gronda. */
  readonly out: Vec3;
  readonly length: number;
  readonly wall: Plane;
}

/**
 * Geometria della tipologia a L (E5, ricerca §3 estensioni):
 *
 * - muro A sul piano y = `larghezzaB` (posteriore) lungo X per `larghezzaA`,
 *   muro B sul piano x = 0 (sinistro) lungo Y per `larghezzaB`: angolo
 *   interno dei muri in (0, larghezzaB); ali profonde `profondita`;
 * - un solo pilastro nell'angolo esterno (rientrante) delle gronde, in
 *   (P, larghezzaB − P), sotto l'incrocio a mezzo legno delle due travi di
 *   gronda (trave A lungo X dal muro B, trave B lungo Y dal muro A, scarpa
 *   d'ancoraggio a muro, sbalzo oltre il pilastro fino alla testa dell'ala);
 * - falde dei travetti (perpendicolari al proprio muro) inclinate di
 *   `pendenza` verso l'esterno; le falde si incontrano sulla diagonale
 *   dall'angolo dei muri all'angolo delle gronde: cantonale di compluvio
 *   (45° in pianta, pendenza atan(tan α / √2)) con l'intradosso sulla linea
 *   d'incontro, alto come i travetti, dalla banchina (o dai muri) all'angolo
 *   della gronda;
 * - travetti appoggiati sulla banchina (becco d'uccello, carpenteria) o sulla
 *   staffa inclinata (bullonata), sulle travi di gronda (becco d'uccello o
 *   appoggio avvitato sullo spigolo a valle); quelli che incontrano il
 *   compluvio sono tagliati sul piano verticale della sua faccia (taglio
 *   composto: a piombo e 45° in pianta), gli altri a piombo sulla gronda.
 */
function geometry(ctx: BuildContext) {
  const LA = ctx.num("larghezzaA");
  const LB = ctx.num("larghezzaB");
  const P = ctx.num("profondita");
  const H = ctx.num("altezza");
  const mode = constructionOf(ctx);
  const attacco = ctx.enum("attaccoMuro") as WallAttachment;
  const slope = mode === "bullonata" ? WALL_SLOPE[attacco]! : ctx.num("pendenza");
  const t = Math.tan(degToRad(slope));
  if (LA < P + 500) throw new ParamError("larghezzaA", LA, `l'ala A deve superare la profondità di almeno 500 mm (≥ ${P + 500})`);
  if (LB < P + 500) throw new ParamError("larghezzaB", LB, `l'ala B deve superare la profondità di almeno 500 mm (≥ ${P + 500})`);
  const YA = LB;
  const se = ctx.section("sezioneTrave");
  const sj = ctx.section("sezioneTravetto");
  const sbalzo = ctx.num("sbalzo");
  // intradosso dei travetti: il piano passa per lo spigolo a valle delle travi di gronda
  // (abbassato della sede del becco d'uccello in carpenteria)
  const seat = mode === "carpenteria" ? seatOffset(slope, [se.b], sj) / Math.cos(degToRad(slope)) : 0;
  const beamTop = H + se.h;
  const uEdge = P + se.b / 2; // distanza dal muro dello spigolo esterno della trave di gronda
  const zWall = beamTop - seat + uEdge * t; // intradosso dei travetti sul piano del muro
  const frame = lFrame(ctx, YA);
  const wings: Wing[] = frame.custom
    ? [
        { key: "A", origin: frame.C, along: frame.dA, out: frame.nA, length: LA, wall: frame.wallA },
        { key: "B", origin: add(frame.C, scale(frame.dB, LB)), along: scale(frame.dB, -1), out: frame.nB, length: LB, wall: frame.wallB },
      ]
    : [
        { key: "A", origin: vec3(0, YA, 0), along: vec3(1, 0, 0), out: vec3(0, -1, 0), length: LA, wall: plane(vec3(0, YA, 0), vec3(0, -1, 0)) },
        { key: "B", origin: vec3(0, 0, 0), along: vec3(0, 1, 0), out: vec3(1, 0, 0), length: LB, wall: plane(vec3(0, 0, 0), vec3(1, 0, 0)) },
      ];
  return { LA, LB, P, H, mode, attacco, slope, t, YA, se, sj, sbalzo, seat, beamTop, uEdge, zWall, wings, frame };
}

/**
 * Riferimento dei due muri: angolo interno `C`, versori lungo i muri dall'angolo
 * verso le teste delle ali (`dA`, `dB`) e normali entranti (`nA`, `nB`). Di
 * default muro A posteriore (y = larghezzaB) e muro B sinistro (x = 0); con i
 * muri reali (`ctx.wallPlane` = A, `ctx.wallPlane2` = B, fuorisquadra P4) gli
 * orientamenti vengono dai piani e i muri passano per l'angolo interno, così
 * profondità e lunghezze delle ali restano misurate dall'angolo.
 */
function lFrame(ctx: BuildContext, YA: number) {
  const C = vec3(0, YA, 0);
  const orient = (given: Plane | undefined, def: Vec3, label: string): Vec3 => {
    if (!given) return def;
    const n = normalize(given.normal);
    if (Math.abs(n.z) > 1e-6) throw new TemplateError(ctx.slug, `il piano del ${label} deve essere verticale`);
    if (dot(n, def) < Math.SQRT1_2) throw new TemplateError(ctx.slug, `il piano del ${label} non è compatibile con la tipologia a L (rotazione oltre 45°)`);
    return n;
  };
  const custom = ctx.wallPlane !== undefined || ctx.wallPlane2 !== undefined;
  const nA = orient(ctx.wallPlane, vec3(0, -1, 0), "muro A (posteriore)");
  const nB = orient(ctx.wallPlane2, vec3(1, 0, 0), "muro B (sinistro)");
  const dA = vec3(-nA.y + 0, nA.x + 0, 0);
  const dB = vec3(nB.y + 0, -nB.x + 0, 0);
  const det = nA.x * nB.y - nA.y * nB.x;
  if (Math.abs(det) < 0.5) throw new TemplateError(ctx.slug, "i due muri devono formare un angolo tra 60° e 120°");
  /** Punto in pianta a distanza `a` dal muro A e `b` dal muro B (dentro l'angolo). */
  const at = (a: number, b: number, z = 0): Vec3 =>
    custom ? vec3(C.x + (a * nB.y - b * nA.y) / det, C.y + (nA.x * b - nB.x * a) / det, z) : vec3(b, YA - a, z);
  const ud = custom ? normalize(sub(at(1, 1), C)) : normalize(vec3(1, -1, 0));
  let nd = custom ? vec3(-ud.y, ud.x, 0) : normalize(vec3(1, 1, 0));
  if (dot(nd, nA) > 0) nd = scale(nd, -1); // verso l'ala A (lontano dalla sua normale entrante)
  return { custom, C, nA, nB, dA, dB, at, ud, nd, wallA: plane(C, nA), wallB: plane(C, nB) };
}

type Geometry = ReturnType<typeof geometry>;

/** Quota dell'intradosso dei travetti dell'ala alla distanza `u` dal muro. */
const zPlane = (g: Geometry, u: number): number => g.zWall - u * g.t;

/** Spigolo superiore di `support` più in basso lungo l'elemento, nel piano verticale dell'elemento (locale entro [0, L]). */
function downhillEdge(piece: Placed, support: Placed): Vec3 | undefined {
  const X = axisOf(piece.pose, 0);
  const n = cross(X, up);
  const mid = plane(applyToPoint(piece.pose, vec3(0, 0, 0)), normalize(n));
  const inv = invertRigid(piece.pose);
  let best: { p: Vec3; x: number } | undefined;
  for (const y of [-support.section.b / 2, support.section.b / 2]) {
    const p0 = applyToPoint(support.pose, vec3(0, y, support.section.h / 2));
    const d = axisOf(support.pose, 0);
    if (Math.abs(dot(d, mid.normal)) < 1e-9) continue;
    const hit = intersectLinePlane(p0, d, mid);
    if (hit.t < -1e-6 || hit.t > support.length + 1e-6) continue;
    const x = applyToPoint(inv, hit.point).x;
    if (x < 0 || x > piece.length) continue;
    if (!best || x < best.x) best = { p: hit.point, x };
  }
  return best?.p;
}

/** Becco d'uccello con vertice nel punto (sistema assieme) e faccia d'appoggio orizzontale. */
const beccoAt = (vertex: Vec3, slope: number) => (piece: Piece): MachiningSpec => {
  const q = applyToPoint(invertRigid(piece.pose), vertex);
  return { type: "becco-uccello", face: "inferiore", at: q.x, depth: q.z + piece.section.h / 2, angle: slope };
};

export const aElle: TypologyTemplate = {
  slug: "a-elle",
  name: "Pergola a L",
  description:
    "Due ali addossate a due muri ad angolo con un solo pilastro nell'angolo delle gronde, falde verso l'esterno e cantonale di compluvio sulla diagonale.",
  category: "addossata",
  tags: ["a L", "angolo", "compluvio", "addossata", "due muri", "banchina", "monofalda"],
  reference: "§3 estensioni",
  wallPlanes: 2,
  params: [
    numberParam("larghezzaA", "Lunghezza ala A (muro posteriore)", "mm", 2000, 8000, 3600, 50, {
      description: "Dall'angolo interno dei muri alla testa dell'ala, lungo il muro posteriore.",
    }),
    numberParam("larghezzaB", "Lunghezza ala B (muro laterale)", "mm", 2000, 8000, 3600, 50),
    numberParam("profondita", "Profondità delle ali", "mm", 1500, 5000, 3000, 50, {
      description: "Distanza tra il muro e l'asse della trave di gronda (il pilastro sta a questa distanza da entrambi i muri).",
    }),
    numberParam("altezza", "Altezza sotto trave", "mm", 1800, 3500, 2400, 10, { description: "Intradosso delle travi di gronda." }),
    constructionParam("carpenteria"),
    enumParam(
      "attaccoMuro",
      "Attacco dei travetti a muro (bullonata)",
      [
        ["staffa-inclinata-15", "Staffa inclinata 15°", "Pendenza imposta 15°."],
        ["staffa-inclinata-25", "Staffa inclinata 25°", "Pendenza imposta 25°."],
      ],
      "staffa-inclinata-15",
      { visibleWhen: bolted },
    ),
    numberParam("pendenza", "Pendenza", "°", 5, 30, 15, 0.5, { visibleWhen: (p) => !bolted(p) }),
    numberParam("interasse", "Interasse travetti desiderato", "mm", 300, 1200, 600, 10),
    numberParam("sbalzo", "Sbalzo di gronda", "mm", 0, 800, 300, 10, { description: "Sporgenza in pianta dei travetti oltre la faccia esterna delle travi di gronda." }),
    groundAnchorParam("bicchiere"),
    sectionParam("sezionePilastro", "Sezione pilastro", "pilastro", "120×120"),
    sectionParam("sezioneTrave", "Sezione travi di gronda", "trave", "120×160"),
    sectionParam("sezioneTravetto", "Sezione travetti", "travetto", "80×160"),
    sectionParam("sezioneCompluvio", "Sezione compluvio", "cantonale", "120×160"),
    { ...sectionParam("sezioneBanchina", "Sezione banchine", "banchina", "100×200"), visibleWhen: (p) => !bolted(p) },
  ],

  build(ctx) {
    const g = geometry(ctx);
    const carp = g.mode === "carpenteria";
    const { se, sj, P, YA, t } = g;
    const sv = ctx.section("sezioneCompluvio");
    const sp = ctx.section("sezionePilastro");
    const [c, sn] = [Math.cos(degToRad(g.slope)), Math.sin(degToRad(g.slope))];
    const steps: BuildStep[] = [];
    const screws = (pieces: string[], code: string = SCREWS.code, count: number = SCREWS.count) =>
      steps.push({ kind: "hardware", code, pieces, params: { count } });

    // --- pilastro d'angolo e travi di gronda incrociate -------------------------------------
    const fr = g.frame;
    const corner = fr.custom ? fr.at(P, P) : vec3(P, YA - P, 0);
    const tenonLen = Math.min(60, se.h / 2 - 10);
    const post = columnStep(ctx, "pilastro", corner.x, corner.y, g.H + (carp ? tenonLen : 0), sp);
    steps.push(post);
    const zBeam = g.H + se.h / 2;
    /** Trave di gronda a distanza P dal muro `own`, dall'altro muro (`other`, testa tagliata sul suo piano) alla testa dell'ala. */
    const eaveBeam = (ref: string, start: Vec3, dir: Vec3, wingLength: number, other: Plane): Placed => {
      const p0 = vec3(start.x, start.y, zBeam);
      const back = lengthToPlane(p0, scale(dir, -1), up, se, other); // il box parte oltre l'altro muro
      return { ref, type: "trave", section: se, length: wingLength - dot(dir, sub(start, fr.C)) + back, pose: fromBasis(sub(p0, scale(dir, back)), dir, up) };
    };
    const beamA: Placed = fr.custom
      ? eaveBeam("trave-A", fr.at(P, 0), fr.dA, g.LA, fr.wallB)
      : { ref: "trave-A", type: "trave", section: se, length: g.LA, pose: fromBasis(vec3(0, YA - P, zBeam), vec3(1, 0, 0), up) };
    const beamB: Placed = fr.custom
      ? eaveBeam("trave-B", fr.at(0, P), fr.dB, g.LB, fr.wallA)
      : { ref: "trave-B", type: "trave", section: se, length: g.LB, pose: fromBasis(vec3(P, YA, zBeam), vec3(0, -1, 0), up) };
    steps.push(placeStep(beamA, "trave di gronda"), placeStep(beamB, "trave di gronda"));
    if (fr.custom) steps.push(headCutOnPlane(beamA.ref, fr.wallB, "testa-inizio"), headCutOnPlane(beamB.ref, fr.wallA, "testa-inizio"));
    steps.push({ kind: "joint", type: "mezzo-legno", a: beamA.ref, b: beamB.ref });
    if (carp) steps.push({ kind: "joint", type: "tenone-mortasa", a: "pilastro", b: beamA.ref, params: { width: Math.round(sp.b / 3), height: Math.round((2 * sp.h) / 3), length: tenonLen, gap: 1 } });
    else screws(["pilastro", beamA.ref, beamB.ref]);
    // teste a muro delle travi di gronda: scarpa d'ancoraggio
    const shoe = hardwareFor("staffa-muro", se).find((h) => h.code.startsWith("scarpa-ancoraggio-"))?.code;
    if (!shoe) throw new ParamError("sezioneTrave", sectionLabel(se), "nessuna scarpa d'ancoraggio a catalogo per la sezione della trave di gronda");
    for (const b of [beamA, beamB]) steps.push({ kind: "hardware", code: shoe, pieces: [b.ref], anchor: "piede" });

    // --- banchine (carpenteria): spigolo a valle sopra l'intradosso dei travetti della sede --
    const banchine = new Map<"A" | "B", Placed>();
    let sb: Section | undefined;
    if (carp) {
      sb = ctx.section("sezioneBanchina");
      const c0 = seatOffset(g.slope, [sb.b], sj) / c;
      const zTopB = zPlane(g, sb.b) + c0;
      let bA: Placed;
      let bB: Placed;
      if (fr.custom) {
        // A: dal muro B (entrambi gli spigoli dal lato interno) alla testa dell'ala, lungo il muro A
        const b0 = sb.b;
        const tA = Math.max(0, (-b0 * dot(fr.nB, fr.nA)) / dot(fr.nB, fr.dA));
        const oA = add(add(fr.C, scale(fr.nA, b0 / 2)), scale(fr.dA, tA));
        bA = { ref: "banchina-A", type: "banchina", section: sb, length: g.LA - tA, pose: fromBasis(vec3(oA.x, oA.y, zTopB - sb.h / 2), fr.dA, up) };
        // B: dalla testa dell'ala fino alla faccia anteriore della banchina A
        const tB = Math.max(b0 / dot(fr.nA, fr.dB), (b0 - b0 * dot(fr.nA, fr.nB)) / dot(fr.nA, fr.dB));
        const oB = add(add(fr.C, scale(fr.nB, b0 / 2)), scale(fr.dB, g.LB));
        bB = { ref: "banchina-B", type: "banchina", section: sb, length: g.LB - tB, pose: fromBasis(vec3(oB.x, oB.y, zTopB - sb.h / 2), scale(fr.dB, -1), up) };
      } else {
        bA = { ref: "banchina-A", type: "banchina", section: sb, length: g.LA, pose: fromBasis(vec3(0, YA - sb.b / 2, zTopB - sb.h / 2), vec3(1, 0, 0), up) };
        bB = { ref: "banchina-B", type: "banchina", section: sb, length: YA - sb.b, pose: fromBasis(vec3(sb.b / 2, 0, zTopB - sb.h / 2), vec3(0, 1, 0), up) };
      }
      for (const b of [bA, bB]) {
        steps.push(placeStep(b));
        const n = Math.max(2, Math.ceil(b.length / 600 - 1e-9) + 1);
        for (let i = 0; i < n; i++)
          steps.push({ kind: "machining", target: b.ref, spec: { type: "foro", face: "sinistra", diameter: 12, offset: 0, at: 150 + (i * (b.length - 300)) / (n - 1) } });
        steps.push({ kind: "hardware", code: "tassello-10x85", pieces: [b.ref], params: { count: n } });
      }
      banchine.set("A", bA).set("B", bB);
    }

    // --- compluvio sulla diagonale -------------------------------------------------------------
    const ud = fr.ud; // dall'angolo dei muri all'angolo delle gronde (bisettrice dei muri)
    const nd = fr.nd; // verso l'ala A
    const wallCorner = fr.C;
    // distanza dai muri di un punto della bisettrice per unità di ascissa (1/√2 con muri ortogonali)
    const k = fr.custom ? dot(ud, fr.nA) : Math.SQRT1_2;
    const onLine = (s: number): Vec3 => {
      const p = add(wallCorner, scale(ud, s));
      return vec3(p.x, p.y, zPlane(g, fr.custom ? s * k : s / Math.SQRT2));
    };
    const tEave = fr.custom ? (g.uEdge + g.sbalzo) / k : (g.uEdge + g.sbalzo) * Math.SQRT2; // angolo della gronda
    // teste del box oltre gli angoli quanto basta perché i due tagli asportino tutta la sezione
    const ext = sv.b / 2 + sv.h / 2 + 10;
    const top = onLine(-ext); // oltre l'angolo dei muri (poi tagliato sui muri)
    const foot = onLine(tEave + ext); // oltre l'angolo della gronda (poi tagliato sulle gronde)
    const Xv = normalize(sub(top, foot));
    const Zv = normalize(sub(up, scale(Xv, Xv.z)));
    const slopeV = radToDeg(Math.asin(Xv.z));
    const valley: Placed = {
      ref: "compluvio",
      type: "cantonale",
      section: sv,
      length: Math.hypot(top.x - foot.x, top.y - foot.y, top.z - foot.z),
      pose: fromBasis(add(foot, scale(Zv, sv.h / 2)), Xv, Zv),
    };
    const yGronda = YA - g.uEdge - g.sbalzo;
    const xGronda = g.uEdge + g.sbalzo;
    const uE = g.uEdge + g.sbalzo;
    steps.push(
      placeStep(valley, "compluvio"),
      headCutOnPlane(valley.ref, fr.custom ? plane(add(fr.C, scale(fr.nA, uE)), fr.nA) : plane(vec3(0, yGronda, 0), vec3(0, -1, 0)), "testa-inizio"),
      headCutOnPlane(valley.ref, fr.custom ? plane(add(fr.C, scale(fr.nB, uE)), fr.nB) : plane(vec3(xGronda, 0, 0), vec3(1, 0, 0)), "testa-inizio"),
      headCutOnPlane(valley.ref, g.wings[0].wall, "testa-fine"),
      headCutOnPlane(valley.ref, g.wings[1].wall, "testa-fine"),
    );
    // sede sull'incrocio delle travi di gronda (vertice nell'angolo esterno dell'incrocio)
    const vBeam = fr.custom ? fr.at(P + se.b / 2, P + se.b / 2, g.beamTop) : vec3(corner.x + se.b / 2, corner.y - se.b / 2, g.beamTop);
    if (carp) steps.push({ kind: "machining", target: valley.ref, fromPiece: beccoAt(vBeam, slopeV) });
    screws([valley.ref, beamA.ref, beamB.ref]);
    if (carp) {
      // sede sulle banchine (vertice nell'angolo delle loro facce anteriori)
      const zB = banchine.get("A")!.pose[11] + sb!.h / 2;
      const vB = fr.custom ? fr.at(sb!.b, sb!.b, zB) : vec3(sb!.b, YA - sb!.b, zB);
      steps.push({ kind: "machining", target: valley.ref, fromPiece: beccoAt(vB, slopeV) });
      screws([valley.ref, "banchina-A", "banchina-B"]);
    } else {
      // bullonata: staffa a muro nell'angolo dei muri (pendenza della staffa ≠ quella del compluvio: approssimazione)
      const at = applyToPoint(invertRigid(valley.pose), onLine(0)).x;
      steps.push({ kind: "hardware", code: g.attacco, pieces: [valley.ref], anchor: "faccia", params: { at } });
    }

    // --- travetti delle due ali ----------------------------------------------------------------
    for (const w of g.wings) {
      const beam = w.key === "A" ? beamA : beamB;
      const X = add(scale(w.out, -c), scale(up, sn)); // in salita verso il muro
      const Z = add(scale(up, c), scale(w.out, sn));
      const face = plane(add(wallCorner, scale(nd, (w.key === "A" ? 1 : -1) * (sv.b / 2))), nd); // faccia del compluvio dal lato dell'ala
      const gronda = plane(add(w.origin, scale(w.out, g.uEdge + g.sbalzo)), w.out);
      const as = spread(0, w.length, sj.b, joistSpaces(w.length - sj.b, ctx.num("interasse")));
      as.forEach((a, i) => {
        const p0 = add(w.origin, scale(w.along, a)); // sul muro
        // distanza dal muro alla faccia del compluvio lungo la linea del travetto
        const den = dot(w.out, face.normal);
        const uFace = dot(sub(face.point, p0), face.normal) / den;
        const reachesValley = uFace <= g.uEdge + g.sbalzo + sj.b;
        if (reachesValley && uFace < MIN_JACK) return; // troppo corto vicino all'angolo dei muri
        const uStart = reachesValley ? uFace + sj.b / 2 + 5 : g.uEdge + g.sbalzo; // spigolo inferiore della testa bassa
        const axisAtWall = add(vec3(p0.x, p0.y, zPlane(g, 0)), scale(Z, sj.h / 2));
        const sStart = -uStart / c;
        const sEnd = sj.h * t;
        const ref = `travetto-${w.key}-${i}`;
        const placed: Placed = { ref, type: "travetto", section: sj, length: sEnd - sStart, pose: fromBasis(add(axisAtWall, scale(X, sStart)), X, Z) };
        steps.push(placeStep(placed), headCutOnPlane(ref, reachesValley ? face : gronda, "testa-inizio"));
        // travetto di compluvio vicino all'angolo della gronda: tagliato anche sulla gronda
        if (reachesValley && uStart > g.uEdge + g.sbalzo) steps.push(headCutOnPlane(ref, gronda, "testa-inizio"));
        // testa a muro: banchina (becco d'uccello) o staffa inclinata
        steps.push(headCutOnPlane(ref, w.wall, "testa-fine"));
        if (carp) {
          const b = banchine.get(w.key)!;
          const v = downhillEdge(placed, b);
          if (v) steps.push({ kind: "machining", target: ref, fromPiece: beccoAt(v, g.slope) });
          screws([ref, b.ref], joistScrewFor(sj), 1);
        } else steps.push({ kind: "hardware", code: g.attacco, pieces: [ref], anchor: "testa" });
        // appoggio sulla trave di gronda (spigolo a valle entro il travetto)
        const v = downhillEdge(placed, beam);
        const uV = v ? dot(sub(v, p0), w.out) : Infinity;
        if (v && uV < (reachesValley ? uFace - sj.b / 2 : Infinity)) {
          if (carp) steps.push({ kind: "machining", target: ref, fromPiece: beccoAt(v, g.slope) });
          screws([ref, beam.ref], joistScrewFor(sj), 1);
        }
        if (reachesValley) screws([ref, valley.ref], joistScrewFor(sj), 1);
      });
    }

    steps.push(...groundAnchor(ctx, ctx.enum("ancoraggioTerra") as GroundAnchor, "pilastro", sp));
    return steps;
  },

  meta(ctx) {
    const g = geometry(ctx);
    return {
      costruzione: g.mode,
      pendenza: g.slope,
      originePendenza: g.mode === "bullonata" ? "ferramenta" : "parametro",
      pendenzaCompluvio: radToDeg(Math.atan(g.t / Math.SQRT2)),
      quotaGronda: g.H,
    };
  },
};
