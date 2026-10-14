import { degToRad } from "../../math/mat4";
import { plane } from "../../math/plane";
import { vec3 } from "../../math/vec3";
import { ParamError, type BuildContext, type BuildStep, type TypologyTemplate } from "../template";
import {
  type GroundAnchor,
  type JoistLine,
  type PortalResult,
  beamOnPosts,
  constructionOf,
  constructionParam,
  enumParam,
  groundAnchor,
  groundAnchorParam,
  joistSpaces,
  joistsOnBeams,
  numberParam,
  sectionParam,
  spread,
} from "./shared";

/** Campata minima tra gli assi di due portali (mm). */
const MIN_BAY = 500;
/** Distanza tra fianco del pilastro e travetto d'estremità in carpenteria (mm). */
const CARPENTRY_JOIST_CLEARANCE = 20;

const monofalda = (p: Readonly<Record<string, unknown>>) => p.forma === "monofalda";

/**
 * Geometria del portale sandwich (E5, ricerca T-A/T-C/T-G):
 *
 * - `campate + 1` portali paralleli al fronte (travi lungo X lunghe
 *   `larghezza`), assi equidistanti in Y: il primo e l'ultimo a `sbalzo` dalle
 *   teste dei travetti (y = 0 e y = `profondita`);
 * - `pilastriPerPortale` pilastri per portale, i due d'estremità a
 *   `sbalzoLaterale` (in asse) dalle teste delle travi;
 * - travetti lungo Y distribuiti tra gli assi dei pilastri d'estremità con
 *   interasse ≤ `interasse`, uno per campata: in `bullonata` piana si
 *   attestano sull'asse dei portali intermedi (12 × 3000 nel 4×6); con
 *   pendenza in profondità o in `carpenteria` i travetti di campate
 *   consecutive sono affiancati (sfalsati di una base) e coprono tutta la
 *   trave intermedia, così appoggiano sugli spigoli a valle con la pendenza
 *   esatta (o ricevono il becco d'uccello / il mezzo legno su tutta la trave);
 * - `forma` `monofalda`: `direzionePendenza` `profondita` → portali a quote
 *   decrescenti verso +Y con passo `campata·tan(pendenza)`; `larghezza` →
 *   travi inclinate in salita verso +X, pilastri di altezza diversa con testa
 *   a squadra (cerniera sul bullone) o tagliata sul piano della trave
 *   (`testaPilastro`). `altezza` è la quota d'intradosso minima.
 */
function geometry(ctx: BuildContext) {
  const W = ctx.num("larghezza");
  const P = ctx.num("profondita");
  const H = ctx.num("altezza");
  const campate = ctx.num("campate");
  const sbalzo = ctx.num("sbalzo");
  const lateral = ctx.num("sbalzoLaterale");
  const sloped = ctx.enum("forma") === "monofalda";
  const dir = ctx.enum("direzionePendenza") as "profondita" | "larghezza";
  const slope = sloped ? ctx.num("pendenza") : 0;
  const t = Math.tan(degToRad(slope));
  const bay = (P - 2 * sbalzo) / campate;
  if (bay < MIN_BAY)
    throw new ParamError("sbalzo", sbalzo, `campata di ${Math.round(bay)} mm tra i portali: servono almeno ${MIN_BAY} mm (ridurre sbalzo o campate)`);
  if (W - 2 * lateral < MIN_BAY)
    throw new ParamError("sbalzoLaterale", lateral, `interasse dei pilastri d'estremità di ${W - 2 * lateral} mm: servono almeno ${MIN_BAY} mm`);
  const portalYs = Array.from({ length: campate + 1 }, (_, k) => sbalzo + k * bay);
  const depthSlope = sloped && dir === "profondita";
  const widthSlope = sloped && dir === "larghezza";
  // intradosso di ogni portale in s = 0 (testa iniziale della trave)
  const undersides = portalYs.map((_, k) => (depthSlope ? H + (campate - k) * bay * t : H));
  return { W, P, H, campate, sbalzo, lateral, slope, t, bay, portalYs, undersides, depthSlope, widthSlope };
}

export const portaleSandwich: TypologyTemplate = {
  slug: "portale-sandwich",
  name: "Portale sandwich",
  description:
    "Pergola autoportante a portali paralleli al fronte: trave doppia a sandwich bullonata ai pilastri (o trave di carpenteria), travetti in appoggio, piana o monofalda.",
  category: "autoportante",
  tags: ["libera", "sandwich", "bullonata", "portali", "piana", "monofalda", "MAXI", "camper"],
  reference: "T-A/T-C/T-G",
  params: [
    numberParam("larghezza", "Larghezza (lunghezza delle travi)", "mm", 2000, 8000, 4000, 50),
    numberParam("profondita", "Profondità (lunghezza dei travetti)", "mm", 2000, 12000, 6000, 50),
    numberParam("altezza", "Altezza sotto trave", "mm", 1800, 4000, 2400, 10, {
      description: "Quota d'intradosso minima delle travi (lato basso in monofalda).",
    }),
    numberParam("campate", "Campate", "n", 1, 6, 2, 1, { integer: true, description: "Campi tra i portali (portali = campate + 1)." }),
    numberParam("pilastriPerPortale", "Pilastri per portale", "n", 2, 4, 2, 1, { integer: true }),
    numberParam("interasse", "Interasse travetti desiderato", "mm", 300, 1200, 700, 10, {
      description: "Interasse massimo dei travetti tra gli assi dei pilastri d'estremità.",
    }),
    numberParam("sbalzo", "Sbalzo dei travetti", "mm", 0, 1000, 90, 10, {
      description: "Sporgenza dei travetti oltre l'asse dei portali d'estremità.",
    }),
    numberParam("sbalzoLaterale", "Sbalzo laterale delle travi", "mm", 100, 1500, 300, 10, {
      description: "Distanza tra la testa della trave e l'asse del pilastro d'estremità.",
    }),
    enumParam("forma", "Forma", [["piana", "Piana"], ["monofalda", "Monofalda"]], "piana"),
    enumParam(
      "direzionePendenza",
      "Direzione della pendenza",
      [
        ["profondita", "In profondità", "Portali a quote decrescenti, travetti inclinati."],
        ["larghezza", "Lungo il fronte", "Travi inclinate, pilastri di altezza diversa."],
      ],
      "profondita",
      { visibleWhen: monofalda },
    ),
    numberParam("pendenza", "Pendenza", "°", 1, 25, 5, 0.5, { visibleWhen: monofalda }),
    enumParam(
      "testaPilastro",
      "Testa dei pilastri",
      [
        ["squadra", "A squadra", "Il bullone fa da cerniera, la testa resta sotto la trave inclinata."],
        ["inclinata", "Inclinata", "Taglio di testa sul piano della trave."],
      ],
      "squadra",
      { visibleWhen: (p) => p.forma === "monofalda" && p.direzionePendenza === "larghezza" },
    ),
    constructionParam(),
    groundAnchorParam("bicchiere"),
    { kind: "boolean", name: "controventi", label: "Controventi (saette 750)", default: false },
    sectionParam("sezionePilastro", "Sezione pilastri", "pilastro", "90×90"),
    { ...sectionParam("sezioneTavola", "Sezione tavole (sandwich)", "tavola", "45×120"), visibleWhen: (p) => p.costruzione === "bullonata" },
    { ...sectionParam("sezioneTrave", "Sezione travi (carpenteria)", "trave", "120×200"), visibleWhen: (p) => p.costruzione === "carpenteria" },
    sectionParam("sezioneTravetto", "Sezione travetti", "travetto", "45×90"),
    { ...sectionParam("sezioneControvento", "Sezione saette", "controvento", "90×90"), visibleWhen: (p) => p.controventi === true },
  ],

  build(ctx) {
    const g = geometry(ctx);
    const mode = constructionOf(ctx);
    const sp = ctx.section("sezionePilastro");
    const sj = ctx.section("sezioneTravetto");
    const n = ctx.num("pilastriPerPortale");
    const postXs = Array.from({ length: n }, (_, i) => g.lateral + (i * (g.W - 2 * g.lateral)) / (n - 1));
    const steps: BuildStep[] = [];

    const portals: PortalResult[] = g.portalYs.map((y, k) =>
      beamOnPosts(ctx, mode, {
        prefix: `portale-${k}`,
        start: { x: 0, y },
        dir: { x: 1, y: 0 },
        length: g.W / Math.cos(degToRad(g.widthSlope ? g.slope : 0)),
        posts: postXs,
        underside: g.undersides[k],
        slope: g.widthSlope ? g.slope : 0,
        postSection: sp,
        plank: ctx.section("sezioneTavola"),
        beam: ctx.section("sezioneTrave"),
        postHead: ctx.enum("testaPilastro") as "squadra" | "inclinata",
        braces: ctx.bool("controventi") ? { section: ctx.section("sezioneControvento") } : undefined,
      }),
    );
    portals.forEach((p) => steps.push(...p.steps));

    // travetti: una fila per campata, tra gli assi dei pilastri d'estremità
    // in carpenteria i travetti d'estremità stanno appena fuori dai pilastri: il mezzo legno non
    // si sovrappone alla mortasa del tenone nella trave
    const half = portals[0].width / 2;
    const stagger = g.depthSlope || mode === "carpenteria";
    const inset = mode === "carpenteria" ? -(sp.h / 2 + sj.b / 2 + CARPENTRY_JOIST_CLEARANCE + (stagger && g.campate > 1 ? sj.b : 0)) : 0;
    const [xa, xb] = [postXs[0] + inset, postXs[n - 1] - inset];
    const xs = spread(xa - sj.b / 2, xb + sj.b / 2, sj.b, joistSpaces(xb - xa, ctx.num("interasse")));
    const joists: JoistLine[] = [];
    for (let k = 0; k < g.campate; k++) {
      const y0 = k === 0 ? 0 : stagger ? g.portalYs[k] - half : g.portalYs[k];
      const y1 = k === g.campate - 1 ? g.P : stagger ? g.portalYs[k + 1] + half : g.portalYs[k + 1];
      const dx = stagger && k % 2 === 1 ? sj.b : 0;
      xs.forEach((x, i) => joists.push({ ref: `travetto-${k}-${i}`, section: sj, from: { x: x + dx, y: y0 }, to: { x: x + dx, y: y1 } }));
    }
    // piano d'appoggio: estradosso delle travi (in profondità: per gli spigoli a valle, verso +Y)
    const top = portals[0].top;
    const seat = g.depthSlope ? plane(vec3(0, g.portalYs[0] + half, top.point.z), vec3(0, g.t, 1)) : top;
    steps.push(...joistsOnBeams(ctx, mode, { joists, seat, supports: portals.flatMap((p) => p.beams) }).steps);

    const anchor = ctx.enum("ancoraggioTerra") as GroundAnchor;
    for (const p of portals) for (const post of p.posts) steps.push(...groundAnchor(ctx, anchor, post.ref, sp));
    return steps;
  },

  meta(ctx) {
    const g = geometry(ctx);
    return {
      forma: ctx.enum("forma"),
      costruzione: ctx.enum("costruzione"),
      pendenza: g.slope,
      portali: g.portalYs.length,
      campata: g.bay,
      ...Object.fromEntries(g.undersides.map((z, k) => [`intradossoPortale${k + 1}`, z])),
    };
  },
};
