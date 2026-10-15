import { applyToPoint, axisOf, degToRad, fromBasis } from "../../math/mat4";
import { plane } from "../../math/plane";
import { vec3 } from "../../math/vec3";
import { ParamError, type BuildContext, type BuildStep, type TypologyTemplate } from "../template";
import {
  type GroundAnchor,
  type JoistLine,
  type Placed,
  type PortalResult,
  beamOnPosts,
  constructionOf,
  constructionParam,
  enumParam,
  groundAnchor,
  groundAnchorParam,
  headCutOnPlane,
  joistSpaces,
  joistsOnBeams,
  numberParam,
  placeStep,
  sectionParam,
  seatOffset,
  spread,
} from "./shared";

/** Campata minima tra due file (mm). */
const MIN_BAY = 800;
/** Lunghezza delle saette (mm, ricerca T-G: M08 800×145×45 [dedotto]). DA VALIDARE CON UFFICIO TECNICO. */
const BRACE_LENGTH_SCALARE = 800;
/** Profilo del dardo di Giove dei correnti: inclinazione e dente (mm). DA VALIDARE CON UFFICIO TECNICO. */
const DARDO_ANGLE = 10;
const DARDO_STEP = 30;

type Giunzione = "dritta" | "mezzo-legno" | "dardo-di-giove";

/**
 * Geometria della monofalda scalare (E5, ricerca T-G "Copertura Camper"):
 *
 * - `file` (≥ 3) file di pilastri parallele al fronte, assi equidistanti in Y
 *   con il primo e l'ultimo a `sbalzo` dalle teste dei correnti (y = 0 e
 *   y = `profondita`); quote d'intradosso decrescenti verso +Y con salto
 *   costante `campata·tan(pendenza)` (`altezza` = intradosso dell'ultima fila);
 * - per fila un traverso sandwich (o trave di carpenteria) lungo X lungo
 *   `larghezza`, con saette da 800 nel piano della fila;
 * - correnti (`trave`) lungo Y sopra i traversi, uno per pilastro della fila,
 *   in tronchi di una campata giuntati sopra le file intermedie: `dritta`
 *   (testa contro testa sullo spigolo a valle del traverso), `mezzo-legno` o
 *   `dardo-di-giove` (teste sovrapposte di `lunghezzaGiunto` lungo l'asse,
 *   centrate sulla fila). I correnti appoggiano sugli spigoli a valle dei
 *   traversi con la pendenza esatta; il tronco a valle di un giunto
 *   sovrapposto appoggia sul tronco a monte;
 * - fascia frontale 38×300 a piombo sulle teste anteriori dei correnti
 *   (tagliate a piombo); travetti lungo X opzionali sopra i correnti;
 * - la faccia anteriore della fascia sta in y = 0 (fronte dell'ingombro): i
 *   correnti partono da y = `y0` = b fascia − (h corrente − sede)·sin(pendenza),
 *   così il taglio a piombo per lo spigolo superiore della testa cade in
 *   y = b fascia, e tutte le quote in pianta sono spostate di `y0`.
 */
function geometry(ctx: BuildContext) {
  const mode = constructionOf(ctx);
  const sc = ctx.section("sezioneCorrente");
  const sf = ctx.section("sezioneFascia");
  const W = ctx.num("larghezza");
  const P = ctx.num("profondita");
  const H = ctx.num("altezza");
  const file = ctx.num("file");
  const sbalzo = ctx.num("sbalzo");
  const slope = ctx.num("pendenza");
  const t = Math.tan(degToRad(slope));
  const bay = (P - 2 * sbalzo) / (file - 1);
  if (bay < MIN_BAY) throw new ParamError("file", file, `campata di ${Math.round(bay)} mm tra le file: servono almeno ${MIN_BAY} mm`);
  // sede dei correnti sugli spigoli dei traversi (carpenteria, becco d'uccello: come joistsOnBeams)
  const drop = mode === "carpenteria" ? seatOffset(slope, [ctx.section("sezioneTrave").b], sc) : 0;
  const y0 = sf.b - (sc.h - drop) * Math.sin(degToRad(slope));
  const rowYs = Array.from({ length: file }, (_, k) => y0 + sbalzo + k * bay);
  const undersides = rowYs.map((_, k) => H + (file - 1 - k) * bay * t);
  return { mode, sc, sf, W, P, H, file, sbalzo, slope, t, bay, salto: bay * t, y0, rowYs, undersides };
}

export const monofaldaScalare: TypologyTemplate = {
  slug: "monofalda-scalare",
  name: "Monofalda scalare",
  description:
    "Copertura alta monofalda su file di pilastri a quote decrescenti: traversi sandwich per fila, correnti longitudinali giuntati sopra gli appoggi, fascia frontale e saette.",
  category: "autoportante",
  tags: ["camper", "monofalda", "pilastri scalari", "correnti", "dardo di Giove", "sandwich"],
  reference: "T-G",
  params: [
    numberParam("larghezza", "Larghezza (lunghezza dei traversi)", "mm", 2500, 8000, 4040, 10),
    numberParam("profondita", "Profondità (lunghezza dei correnti)", "mm", 4000, 16000, 7990, 10),
    numberParam("altezza", "Altezza sotto trave (ultima fila)", "mm", 2000, 4500, 3200, 5, {
      description: "Quota d'intradosso dei traversi dell'ultima fila, la più bassa.",
    }),
    numberParam("file", "File di pilastri", "n", 3, 8, 4, 1, { integer: true }),
    numberParam("pilastriPerFila", "Pilastri per fila", "n", 2, 4, 2, 1, { integer: true }),
    numberParam("pendenza", "Pendenza", "°", 1, 15, 2.7, 0.1, { description: "Salto tra le file = campata·tan(pendenza)." }),
    numberParam("sbalzo", "Sbalzo dei correnti", "mm", 0, 1500, 300, 10, { description: "Sporgenza dei correnti oltre l'asse delle file d'estremità." }),
    numberParam("sbalzoLaterale", "Sbalzo laterale dei traversi", "mm", 150, 1500, 500, 10, {
      description: "Distanza tra la testa del traverso e l'asse del pilastro d'estremità.",
    }),
    enumParam(
      "giunzione",
      "Giunzione dei correnti",
      [
        ["dritta", "Dritta", "Teste accostate sopra il traverso."],
        ["mezzo-legno", "Mezzo legno", "Teste sovrapposte a mezzo legno sopra il traverso."],
        ["dardo-di-giove", "Dardo di Giove", "Teste sovrapposte con taglio obliquo a dente."],
      ],
      "dritta",
    ),
    numberParam("lunghezzaGiunto", "Lunghezza del giunto", "mm", 150, 600, 300, 10, {
      visibleWhen: (p) => p.giunzione !== "dritta",
      description: "Sovrapposizione delle teste lungo l'asse dei correnti.",
    }),
    constructionParam(),
    groundAnchorParam("bicchiere"),
    { kind: "boolean", name: "controventi", label: "Saette (800)", default: true },
    { kind: "boolean", name: "travetti", label: "Travetti sopra i correnti", default: false },
    numberParam("interasse", "Interasse travetti desiderato", "mm", 300, 1200, 800, 10, { visibleWhen: (p) => p.travetti === true }),
    sectionParam("sezionePilastro", "Sezione pilastri", "pilastro", "120×120"),
    { ...sectionParam("sezioneTavola", "Sezione tavole (traversi)", "tavola", "45×145"), visibleWhen: (p) => p.costruzione === "bullonata" },
    { ...sectionParam("sezioneTrave", "Sezione traversi (carpenteria)", "trave", "120×200"), visibleWhen: (p) => p.costruzione === "carpenteria" },
    sectionParam("sezioneCorrente", "Sezione correnti", "trave", "45×145"),
    sectionParam("sezioneFascia", "Sezione fascia frontale", "fascia", "38×300"),
    { ...sectionParam("sezioneTravetto", "Sezione travetti", "travetto", "45×120"), visibleWhen: (p) => p.travetti === true },
    { ...sectionParam("sezioneControvento", "Sezione saette", "controvento", "120×120"), visibleWhen: (p) => p.controventi === true },
  ],

  build(ctx) {
    const g = geometry(ctx);
    const { mode, sc, sf } = g;
    const sp = ctx.section("sezionePilastro");
    const lateral = ctx.num("sbalzoLaterale");
    const n = ctx.num("pilastriPerFila");
    if (g.W - 2 * lateral < 500) throw new ParamError("sbalzoLaterale", lateral, "pilastri d'estremità troppo vicini");
    const postXs = Array.from({ length: n }, (_, i) => lateral + (i * (g.W - 2 * lateral)) / (n - 1));
    const steps: BuildStep[] = [];

    // file: traverso (sandwich o trave) su pilastri, saette nel piano della fila
    const rows: PortalResult[] = g.rowYs.map((y, k) =>
      beamOnPosts(ctx, mode, {
        prefix: `fila-${k}`,
        start: { x: 0, y },
        dir: { x: 1, y: 0 },
        length: g.W,
        posts: postXs,
        underside: g.undersides[k],
        postSection: sp,
        plank: ctx.section("sezioneTavola"),
        beam: ctx.section("sezioneTrave"),
        braces: ctx.bool("controventi") ? { section: ctx.section("sezioneControvento"), length: BRACE_LENGTH_SCALARE } : undefined,
      }),
    );
    rows.forEach((r) => steps.push(...r.steps));

    // correnti: piano d'appoggio per gli spigoli a valle dei traversi
    const half = rows[0].width / 2;
    const seat = plane(vec3(0, g.rowYs[0] + half, rows[0].top.point.z), vec3(0, g.t, 1));
    const giunzione = ctx.enum("giunzione") as Giunzione;
    const lap = giunzione === "dritta" ? 0 : ctx.num("lunghezzaGiunto");
    const lapHalf = (lap * Math.cos(degToRad(g.slope))) / 2; // semi-sovrapposizione in pianta
    if (lap > 0 && lapHalf < half)
      throw new ParamError("lunghezzaGiunto", lap, `la sovrapposizione deve coprire il traverso: almeno ${Math.ceil((2 * half) / Math.cos(degToRad(g.slope)))} mm`);
    const correnti: Placed[][] = postXs.map(() => []);
    for (let k = 0; k < g.file - 1; k++) {
      const y0 = k === 0 ? g.y0 : lap ? g.rowYs[k] - lapHalf : g.rowYs[k] + half;
      const y1 = k === g.file - 2 ? g.y0 + g.P : lap ? g.rowYs[k + 1] + lapHalf : g.rowYs[k + 1] + half;
      // il tronco a valle di un giunto sovrapposto appoggia sul tronco a monte, non sul traverso
      const supports = rows.filter((_, r) => r === k + 1 || (r === k && (k === 0 || !lap))).flatMap((r) => r.beams);
      const lines: JoistLine[] = postXs.map((x, i) => ({ ref: `corrente-${i}-${k}`, section: sc, from: { x, y: y0 }, to: { x, y: y1 } }));
      const res = joistsOnBeams(ctx, mode, { joists: lines, seat, supports, type: "trave" });
      steps.push(...res.steps);
      res.joists.forEach((c, i) => correnti[i].push(c));
    }
    // giunti sopra le file intermedie
    if (lap)
      for (const line of correnti)
        for (let k = 1; k < line.length; k++) {
          const [a, b] = [line[k - 1].ref, line[k].ref];
          steps.push(
            giunzione === "mezzo-legno"
              ? { kind: "joint", type: "mezzo-legno", a, b }
              : { kind: "joint", type: "dardo-di-giove", a, b, params: { length: lap, angle: DARDO_ANGLE, step: DARDO_STEP } },
          );
        }

    // teste anteriori a piombo per lo spigolo superiore (asportato il cuneo inferiore) e fascia frontale
    const c0 = correnti[0][0];
    // asse locale in salita: con le quote decrescenti verso +Y la testa anteriore (y ≈ 0) è quella finale
    const frontFace = applyToPoint(c0.pose, vec3(0, 0, 0)).y < applyToPoint(c0.pose, vec3(c0.length, 0, 0)).y ? "testa-inizio" : "testa-fine";
    const frontTop = applyToPoint(c0.pose, vec3(frontFace === "testa-fine" ? c0.length : 0, 0, sc.h / 2));
    const front = plane(vec3(0, frontTop.y, 0), vec3(0, -1, 0));
    for (const line of correnti) steps.push(headCutOnPlane(line[0].ref, front, frontFace));
    const fascia: Placed = {
      ref: "fascia",
      type: "fascia",
      section: sf,
      length: g.W,
      pose: fromBasis(vec3(0, frontTop.y - sf.b / 2, frontTop.z - sf.h / 2), vec3(1, 0, 0), vec3(0, 0, 1)),
    };
    steps.push(placeStep(fascia));

    // travetti opzionali sopra i correnti
    if (ctx.bool("travetti")) {
      const sj = ctx.section("sezioneTravetto");
      const c0 = correnti[0][0];
      const topPlane = plane(applyToPoint(c0.pose, vec3(0, 0, sc.h / 2)), axisOf(c0.pose, 2));
      const ys = spread(g.y0 + sf.b, g.y0 + g.P - sf.b, sj.b, joistSpaces(g.P - 2 * sf.b - sj.b, ctx.num("interasse")));
      const joists: JoistLine[] = ys.map((y, i) => ({ ref: `travetto-${i}`, section: sj, from: { x: 0, y }, to: { x: g.W, y } }));
      steps.push(...joistsOnBeams(ctx, mode, { joists, seat: topPlane, supports: correnti.flat() }).steps);
    }

    const anchor = ctx.enum("ancoraggioTerra") as GroundAnchor;
    for (const r of rows) for (const p of r.posts) steps.push(...groundAnchor(ctx, anchor, p.ref, sp));
    return steps;
  },

  meta(ctx) {
    const g = geometry(ctx);
    return {
      costruzione: ctx.enum("costruzione"),
      giunzione: ctx.enum("giunzione"),
      pendenza: g.slope,
      campata: g.bay,
      salto: g.salto,
      yCorrenti: g.y0,
      ...Object.fromEntries(g.undersides.map((z, k) => [`intradossoFila${k + 1}`, z])),
    };
  },
};
