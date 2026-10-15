import { degToRad, fromBasis } from "../../math/mat4";
import { plane } from "../../math/plane";
import { vec3 } from "../../math/vec3";
import { ParamError, type BuildContext, type BuildStep, type TypologyTemplate } from "../template";
import {
  type GroundAnchor,
  type JoistLine,
  type Placed,
  type PortalResult,
  WALL_SLOPE,
  type WallAttachment,
  beamOnPosts,
  constructionOf,
  constructionParam,
  enumParam,
  groundAnchor,
  groundAnchorParam,
  joistSpaces,
  joistsOnBeams,
  numberParam,
  placeStep,
  sectionParam,
  seatOffset,
  spread,
  wallAttachment,
} from "./shared";

/** Interasse minimo tra due telai (mm). */
const MIN_BAY = 500;
/** Distanza minima tra travetto e muro (mm). */
const WALL_CLEARANCE = 10;
/** Distanza tra fianco del pilastro e primo travetto in carpenteria (mm). */
const CARPENTRY_JOIST_CLEARANCE = 20;
/** Passo massimo dei tasselli della banchina e distanza dalle teste (mm). DA VALIDARE CON UFFICIO TECNICO. */
const BANCHINA_ANCHOR_SPACING = 600;
const BANCHINA_ANCHOR_MARGIN = 150;

const imposed = (p: Readonly<Record<string, unknown>>) => WALL_SLOPE[p.attaccoMuro as WallAttachment] !== undefined;

/**
 * Geometria dell'addossata sandwich (E5, ricerca T-B/T-C/T-F):
 *
 * - `campate + 1` telai ortogonali al muro (piano y = `yMuro`), trave lunga
 *   `profondita` (lunghezza commerciale delle tavole) dalla testa anteriore al
 *   muro, in salita verso il muro con la pendenza effettiva; la testa
 *   anteriore (a squadra) ha lo spigolo superiore, il più avanzato, in y = 0,
 *   cioè l'asse parte da y = `y0` = (h/2)·sin(pendenza) e il muro dista
 *   `profondita·cos(pendenza)` dal fronte;
 * - un pilastro per telaio a `sbalzo` dalla testa anteriore, intradosso della
 *   trave a quota `altezza` sull'asse del pilastro;
 * - testa della trave a filo muro: il muro passa per lo spigolo superiore della
 *   testa e il taglio (`headCutFromPlane`) asporta il cuneo inferiore;
 * - travetti paralleli al muro, lunghi `larghezza` per campata (attestati
 *   sull'asse dei telai intermedi in bullonata, affiancati in carpenteria),
 *   distribuiti tra il pilastro e il muro e ruotati sulla falda;
 * - pendenza imposta dalla ferramenta per staffe inclinate e supporto a
 *   scomparsa (`WALL_SLOPE`), altrimenti `pendenza`.
 */
function geometry(ctx: BuildContext) {
  const W = ctx.num("larghezza");
  const L = ctx.num("profondita");
  const H = ctx.num("altezza");
  const campate = ctx.num("campate");
  const sbalzo = ctx.num("sbalzo");
  const lateral = ctx.num("sbalzoLaterale");
  const attach = ctx.enum("attaccoMuro") as WallAttachment;
  const mode = constructionOf(ctx);
  const forced = WALL_SLOPE[attach];
  const slope = forced ?? ctx.num("pendenza");
  const a = degToRad(slope);
  const sec = mode === "bullonata" ? ctx.section("sezioneTavola") : ctx.section("sezioneTrave");
  if (attach === "listoni-paralleli" && mode !== "bullonata")
    throw new ParamError("attaccoMuro", attach, "la staffa a listoni paralleli serra una trave doppia: usare costruzione bullonata");
  if (attach === "scomparsa-17" && mode !== "carpenteria")
    throw new ParamError("attaccoMuro", attach, "il supporto a scomparsa entra in una trave singola: usare costruzione carpenteria");
  const bay = (W - 2 * lateral) / campate;
  if (bay < MIN_BAY) throw new ParamError("sbalzoLaterale", lateral, `interasse dei telai di ${Math.round(bay)} mm: servono almeno ${MIN_BAY} mm`);
  const y0 = (sec.h / 2) * Math.sin(a);
  const yMuro = y0 + L * Math.cos(a) - (sec.h / 2) * Math.sin(a);
  const yPost = y0 + sbalzo;
  if (yMuro - yPost < 500) throw new ParamError("sbalzo", sbalzo, `il pilastro deve stare ad almeno 500 mm dal muro (profondità ${Math.round(yMuro)} mm)`);
  const frameXs = Array.from({ length: campate + 1 }, (_, k) => lateral + k * bay);
  return { W, L, H, campate, sbalzo, y0, yPost, attach, mode, slope, a, sec, bay, yMuro, frameXs, origin: forced !== undefined ? "ferramenta" : "parametro" };
}

export const addossataSandwich: TypologyTemplate = {
  slug: "addossata-sandwich",
  name: "Addossata sandwich",
  description:
    "Pergola addossata a un muro: telai ortogonali al muro con trave sandwich (o di carpenteria) dal muro al pilastro, travetti paralleli al muro, attacco a staffa o banchina.",
  category: "addossata",
  tags: ["addossata", "sandwich", "bullonata", "monofalda", "staffa a muro", "banchina", "MAXI"],
  reference: "T-B/T-C/T-F",
  params: [
    numberParam("larghezza", "Larghezza (lungo il muro)", "mm", 2000, 12000, 3000, 50),
    numberParam("profondita", "Profondità (lunghezza delle travi)", "mm", 1500, 6000, 2000, 50),
    numberParam("altezza", "Altezza sotto trave al pilastro", "mm", 1800, 4000, 2400, 10, {
      description: "Quota d'intradosso della trave sull'asse dei pilastri.",
    }),
    numberParam("campate", "Campate", "n", 1, 6, 1, 1, { integer: true, description: "Campi tra i telai (pilastri = campate + 1)." }),
    numberParam("interasse", "Interasse travetti desiderato", "mm", 300, 1200, 600, 10),
    numberParam("sbalzo", "Sbalzo frontale della trave", "mm", 0, 1500, 300, 10, {
      description: "Distanza tra la testa anteriore della trave e l'asse del pilastro.",
    }),
    numberParam("sbalzoLaterale", "Sbalzo laterale dei travetti", "mm", 0, 1500, 90, 10, {
      description: "Sporgenza dei travetti oltre l'asse dei telai d'estremità.",
    }),
    enumParam(
      "attaccoMuro",
      "Attacco a muro",
      [
        ["listoni-paralleli", "Staffa a listoni paralleli", "Lama a muro serrata tra le tavole con un bullone (bullonata)."],
        ["staffa-inclinata-15", "Staffa inclinata 15°", "Pendenza imposta 15°."],
        ["staffa-inclinata-25", "Staffa inclinata 25°", "Pendenza imposta 25°."],
        ["scomparsa-17", "Supporto a scomparsa 17°", "Lama in fresata nella trave (carpenteria), pendenza 17°."],
        ["banchina", "Banchina a muro", "Dormiente tassellato con becco d'uccello delle travi."],
      ],
      "listoni-paralleli",
    ),
    numberParam("pendenza", "Pendenza", "°", 0, 30, 5, 0.5, { visibleWhen: (p) => !imposed(p) }),
    constructionParam(),
    groundAnchorParam("bicchiere"),
    { kind: "boolean", name: "controventi", label: "Controventi (saette 750)", default: false },
    sectionParam("sezionePilastro", "Sezione pilastri", "pilastro", "90×90"),
    { ...sectionParam("sezioneTavola", "Sezione tavole (sandwich)", "tavola", "45×120"), visibleWhen: (p) => p.costruzione === "bullonata" },
    { ...sectionParam("sezioneTrave", "Sezione travi (carpenteria)", "trave", "120×200"), visibleWhen: (p) => p.costruzione === "carpenteria" },
    sectionParam("sezioneTravetto", "Sezione travetti", "travetto", "45×90"),
    { ...sectionParam("sezioneBanchina", "Sezione banchina", "banchina", "100×200"), visibleWhen: (p) => p.attaccoMuro === "banchina" },
    { ...sectionParam("sezioneControvento", "Sezione saette", "controvento", "90×90"), visibleWhen: (p) => p.controventi === true },
  ],

  build(ctx) {
    const g = geometry(ctx);
    const sp = ctx.section("sezionePilastro");
    const sj = ctx.section("sezioneTravetto");
    const t = Math.tan(g.a);
    const wall = plane(vec3(0, g.yMuro, 0), vec3(0, -1, 0));
    const steps: BuildStep[] = [];

    // banchina a muro: faccia posteriore sul muro, spigolo a valle sotto l'intradosso della trave
    let banchina: Placed | undefined;
    if (g.attach === "banchina") {
      const sb = ctx.section("sezioneBanchina");
      const yEdge = g.yMuro - sb.b;
      const c = seatOffset(g.slope, [sb.b], g.sec);
      const zEdge = g.H + (yEdge - g.yPost) * t + c / Math.cos(g.a);
      banchina = { ref: "banchina", type: "banchina", section: sb, length: g.W, pose: fromBasis(vec3(0, g.yMuro - sb.b / 2, zEdge - sb.h / 2), vec3(1, 0, 0), vec3(0, 0, 1)) };
      steps.push(placeStep(banchina));
      const m = Math.min(BANCHINA_ANCHOR_MARGIN, g.W / 4);
      const n = Math.max(2, Math.ceil((g.W - 2 * m) / BANCHINA_ANCHOR_SPACING - 1e-9) + 1);
      for (let i = 0; i < n; i++)
        steps.push({ kind: "machining", target: "banchina", spec: { type: "foro", face: "sinistra", diameter: 12, offset: 0, at: m + (i * (g.W - 2 * m)) / (n - 1) } });
      steps.push({ kind: "hardware", code: "tassello-10x85", pieces: ["banchina"], params: { count: n } });
    }

    // telai: trave dal fronte al muro su un pilastro
    const frames: PortalResult[] = g.frameXs.map((x, k) => {
      const f = beamOnPosts(ctx, g.mode, {
        prefix: `telaio-${k}`,
        start: { x, y: g.y0 },
        dir: { x: 0, y: 1 },
        length: g.L,
        posts: [g.sbalzo],
        underside: g.H - g.sbalzo * t,
        slope: g.slope,
        postSection: sp,
        plank: ctx.section("sezioneTavola"),
        beam: ctx.section("sezioneTrave"),
        braces: ctx.bool("controventi") ? { section: ctx.section("sezioneControvento") } : undefined,
      });
      steps.push(...f.steps, ...wallAttachment(ctx, g.attach, { beams: f.beams, face: "testa-fine", wall, banchina }));
      return f;
    });

    // travetti paralleli al muro: dal pilastro (in carpenteria appena davanti) al muro
    const carp = g.mode === "carpenteria";
    const half = frames[0].width / 2;
    const yFirst = carp ? g.yPost - (sp.h / 2 + sj.b / 2 + CARPENTRY_JOIST_CLEARANCE) : g.yPost;
    const yLast = g.yMuro - (sj.b / 2) * Math.cos(g.a) - sj.h * Math.sin(g.a) - WALL_CLEARANCE;
    const ys = spread(yFirst - sj.b / 2, yLast + sj.b / 2, sj.b, joistSpaces(yLast - yFirst, ctx.num("interasse")));
    const joists: JoistLine[] = [];
    for (let k = 0; k < g.campate; k++) {
      const x0 = k === 0 ? 0 : carp ? g.frameXs[k] - half : g.frameXs[k];
      const x1 = k === g.campate - 1 ? g.W : carp ? g.frameXs[k + 1] + half : g.frameXs[k + 1];
      const dy = carp && k % 2 === 1 ? -sj.b : 0;
      ys.forEach((y, i) => joists.push({ ref: `travetto-${k}-${i}`, section: sj, from: { x: x0, y: y + dy }, to: { x: x1, y: y + dy } }));
    }
    steps.push(...joistsOnBeams(ctx, g.mode, { joists, seat: frames[0].top, supports: frames.flatMap((f) => f.beams) }).steps);

    const anchor = ctx.enum("ancoraggioTerra") as GroundAnchor;
    for (const f of frames) for (const p of f.posts) steps.push(...groundAnchor(ctx, anchor, p.ref, sp));
    return steps;
  },

  meta(ctx) {
    const g = geometry(ctx);
    return {
      attaccoMuro: g.attach,
      costruzione: g.mode,
      pendenza: g.slope,
      originePendenza: g.origin,
      quotaImposta: g.H,
      yMuro: g.yMuro,
    };
  },
};
