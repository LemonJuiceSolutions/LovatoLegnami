import { sectionLabel } from "../../components/sections";
import { hardwareFor } from "../../hardware/catalog";
import { applyToPoint, degToRad, fromBasis } from "../../math/mat4";
import { intersectLinePlane, plane } from "../../math/plane";
import { add, norm, scale, sub, vec3 } from "../../math/vec3";
import { ParamError, type BuildContext, type BuildStep, type TypologyTemplate } from "../template";
import {
  BRACE_FOOT_SCREWS,
  BRACE_LENGTH,
  type JoistLine,
  type Placed,
  WALL_SLOPE,
  type WallAttachment,
  enumParam,
  headCutOnPlane,
  joistSpaces,
  joistsOnBeams,
  lengthToPlane,
  numberParam,
  placeStep,
  realWall,
  sectionParam,
  spread,
  wallAttachment,
} from "./shared";

type Attacco = "scomparsa-17" | "staffa-inclinata-15" | "staffa-inclinata-25" | "scarpa";

/** Distanza minima tra travetto e muro (mm). */
const WALL_CLEARANCE = 10;

const imposedSlope = (attacco: string): number | undefined => WALL_SLOPE[attacco as WallAttachment];

/**
 * Geometria della pensilina a sbalzo (E5, ricerca T-J), senza pilastri:
 *
 * - muro sul piano y = `sbalzo` (fronte della fascia in y = 0), `larghezza`
 *   lungo il muro;
 * - `numeroMensole` mensole equidistanti in X (le estreme a `sbalzoLaterale`
 *   dalle teste dei travetti), in salita verso il muro con la pendenza della
 *   ferramenta (`WALL_SLOPE`: scomparsa 17°, staffe inclinate 15°/25°) o
 *   `pendenza` con la scarpa dritta; intradosso a quota `altezza` sul piano
 *   del muro, testa a muro con lo spigolo superiore sul muro (taglio sul piano
 *   del muro), testa anteriore a piombo contro la fascia;
 * - travetti paralleli al muro sopra le mensole, fascia di gronda a piombo
 *   sulle teste delle mensole (estradosso a filo dei travetti);
 * - saette opzionali sotto ogni mensola (750 a 45°) con staffa per listone al
 *   piede, sul muro.
 *
 * Con il muro reale (`ctx.wallPlane`, P4) sbalzo e quota d'attacco valgono nel
 * punto del muro più vicino (`realWall`): le mensole restano parallele (stessa
 * falda per i travetti) e arrivano al muro reale con la testa tagliata sul
 * suo piano (taglio composto), il piede delle saette scivola sul muro.
 */
function geometry(ctx: BuildContext) {
  const W = ctx.num("larghezza");
  const S = ctx.num("sbalzo");
  const H = ctx.num("altezza");
  const n = ctx.num("numeroMensole");
  const lateral = ctx.num("sbalzoLaterale");
  const attacco = ctx.enum("attacco") as Attacco;
  const forced = imposedSlope(attacco);
  const slope = forced ?? ctx.num("pendenza");
  const a = degToRad(slope);
  const sm = ctx.section("sezioneMensola");
  if (W - 2 * lateral < 500) throw new ParamError("sbalzoLaterale", lateral, "mensole d'estremità troppo vicine");
  const xs = Array.from({ length: n }, (_, i) => lateral + (i * (W - 2 * lateral)) / (n - 1));
  return { W, S, H, n, lateral, attacco, slope, a, sm, xs, origin: forced !== undefined ? "ferramenta" : "parametro" };
}

export const pensilinaSbalzo: TypologyTemplate = {
  slug: "pensilina-sbalzo",
  name: "Pensilina a sbalzo",
  description:
    "Tettoia addossata senza pilastri: mensole incastrate a muro con supporto a scomparsa, staffe inclinate o scarpa, travetti paralleli al muro, fascia di gronda e saette opzionali.",
  category: "pensilina",
  tags: ["pensilina", "tettoia", "sbalzo", "mensole", "senza pilastri", "scomparsa", "staffa inclinata"],
  reference: "T-J",
  fitAliases: { profondita: "sbalzo" },
  wallPlanes: 1,
  params: [
    numberParam("larghezza", "Larghezza (lungo il muro)", "mm", 1500, 8000, 4000, 50),
    numberParam("sbalzo", "Sbalzo (dal muro al fronte della fascia)", "mm", 500, 2000, 1200, 10),
    numberParam("altezza", "Quota d'attacco a muro", "mm", 2000, 4000, 2700, 10, {
      description: "Intradosso delle mensole sul piano del muro.",
    }),
    numberParam("numeroMensole", "Numero di mensole", "n", 2, 12, 3, 1, { integer: true }),
    numberParam("sbalzoLaterale", "Sbalzo laterale dei travetti", "mm", 0, 1000, 300, 10, {
      description: "Distanza tra la testa dei travetti e l'asse delle mensole d'estremità.",
    }),
    enumParam(
      "attacco",
      "Attacco a muro",
      [
        ["scomparsa-17", "Supporto a scomparsa 17°", "Lama in fresata nella mensola, pendenza 17°."],
        ["staffa-inclinata-15", "Staffa inclinata 15°", "Pendenza imposta 15°."],
        ["staffa-inclinata-25", "Staffa inclinata 25°", "Pendenza imposta 25°."],
        ["scarpa", "Scarpa d'ancoraggio", "Scarpa dritta, pendenza libera."],
      ],
      "scomparsa-17",
    ),
    numberParam("pendenza", "Pendenza", "°", 0, 30, 10, 0.5, { visibleWhen: (p) => imposedSlope(p.attacco as string) === undefined }),
    numberParam("interasse", "Interasse travetti desiderato", "mm", 300, 1200, 600, 10),
    { kind: "boolean", name: "saette", label: "Saette sotto le mensole", default: false },
    sectionParam("sezioneMensola", "Sezione mensole", "mensola", "90×140"),
    sectionParam("sezioneTravetto", "Sezione travetti", "travetto", "45×90"),
    sectionParam("sezioneFascia", "Sezione fascia di gronda", "fascia", "38×300"),
    { ...sectionParam("sezioneSaetta", "Sezione saette", "controvento", "90×90"), visibleWhen: (p) => p.saette === true },
  ],

  build(ctx) {
    const g = geometry(ctx);
    const sm = g.sm;
    const sf = ctx.section("sezioneFascia");
    const sj = ctx.section("sezioneTravetto");
    const [c, sn, t] = [Math.cos(g.a), Math.sin(g.a), Math.tan(g.a)];
    const X = vec3(0, c, sn); // in salita verso il muro
    const Z = vec3(0, -sn, c);
    const implicitWall = plane(vec3(0, g.S, 0), vec3(0, -1, 0));
    // muro reale (fuorisquadra): sbalzo al punto del muro più vicino, mensole fino al muro reale
    const real = ctx.wallPlane ? realWall(ctx, implicitWall, ctx.wallPlane, [vec3(0, g.S, 0), vec3(g.W, g.S, 0)]) : undefined;
    const wall = real ?? implicitWall;
    const wallY = (x: number): number => (real ? real.point.y - (real.normal.x * (x - real.point.x)) / real.normal.y : g.S);
    // faccia interna della fascia = taglio a piombo delle mensole; il box grezzo della mensola
    // (testa ortogonale all'asse) non deve sporgere oltre il fronte y = 0
    const yPlumb = Math.max(sf.b, sm.h * sn);
    const front = plane(vec3(0, yPlumb, 0), vec3(0, -1, 0));
    const steps: BuildStep[] = [];

    // mensole: intradosso a quota `altezza` sul muro, spigolo superiore della testa sul muro
    const mensole: Placed[] = g.xs.map((x, i) => {
      const axisAtWall = add(vec3(x, g.S, g.H), scale(Z, sm.h / 2));
      const sStart = (yPlumb - g.S) / c;
      const origin = add(axisAtWall, scale(X, sStart));
      const length = real ? lengthToPlane(origin, X, Z, sm, real) : sm.h * t - sStart;
      return { ref: `mensola-${i}`, type: "mensola", section: sm, length, pose: fromBasis(origin, X, Z) };
    });
    for (const m of mensole) {
      steps.push(placeStep(m), headCutOnPlane(m.ref, front, "testa-inizio"));
      if (g.attacco === "scarpa") {
        const code = hardwareFor("staffa-muro", sm).find((h) => h.code.startsWith("scarpa-ancoraggio-"))?.code;
        if (!code)
          throw new ParamError(
            "sezioneMensola",
            sectionLabel(sm),
            `nessuna scarpa d'ancoraggio a catalogo per mensole ${sectionLabel(sm)} (disponibili: ${hardwareFor("staffa-muro")
              .filter((h) => h.code.startsWith("scarpa-ancoraggio-"))
              .map((h) => sectionLabel(h.forSections![0]))
              .join(", ")})`,
          );
        steps.push(headCutOnPlane(m.ref, wall, "testa-fine"), { kind: "hardware", code, pieces: [m.ref], anchor: "testa" });
      } else steps.push(...wallAttachment(ctx, g.attacco, { beams: [m], face: "testa-fine", wall }));
    }

    // travetti paralleli al muro sull'estradosso delle mensole
    const top = plane(applyToPoint(mensole[0].pose, vec3(0, 0, sm.h / 2)), Z);
    const yFirst = yPlumb + sj.b / 2 + WALL_CLEARANCE;
    const yLast = g.S - (sj.b / 2) * c - sj.h * sn - WALL_CLEARANCE;
    if (yLast - yFirst < sj.b) throw new ParamError("sbalzo", g.S, "sbalzo insufficiente per i travetti");
    const ys = spread(yFirst - sj.b / 2, yLast + sj.b / 2, sj.b, joistSpaces(yLast - yFirst, ctx.num("interasse")));
    const joists: JoistLine[] = ys.map((y, i) => ({ ref: `travetto-${i}`, section: sj, from: { x: 0, y }, to: { x: g.W, y } }));
    steps.push(...joistsOnBeams(ctx, "bullonata", { joists, seat: top, supports: mensole }).steps);

    // fascia di gronda: contro le teste a piombo, estradosso a filo dei travetti
    const zTopAtFront = top.point.z - (top.normal.y * (yPlumb - top.point.y)) / top.normal.z + sj.h / c;
    steps.push(
      placeStep({
        ref: "fascia",
        type: "fascia",
        section: sf,
        length: g.W,
        pose: fromBasis(vec3(0, yPlumb - sf.b / 2, zTopAtFront - sf.h / 2), vec3(1, 0, 0), vec3(0, 0, 1)),
      }),
    );

    // saette sotto le mensole: a 45° dal muro all'intradosso, staffa per listone al piede
    if (ctx.bool("saette")) {
      const ss = ctx.section("sezioneSaetta");
      const footCode = hardwareFor("staffa-muro", ss).find((h) => h.code.startsWith("staffa-listone-"))?.code;
      if (!footCode) throw new ParamError("sezioneSaetta", sectionLabel(ss), "nessuna staffa per listone a catalogo per la saetta");
      const ax = vec3(0, -Math.SQRT1_2, Math.SQRT1_2);
      const az = vec3(0, Math.SQRT1_2, Math.SQRT1_2);
      const run = (BRACE_LENGTH - ss.h) / Math.SQRT2; // sporgenza in pianta dell'asse dal muro
      if (run > g.S - yPlumb - ss.h) throw new ParamError("saette", true, `sbalzo insufficiente per saette da ${BRACE_LENGTH} mm`);
      mensole.forEach((m, i) => {
        const bottom = plane(applyToPoint(m.pose, vec3(0, 0, -sm.h / 2)), Z);
        const x = g.xs[i];
        const yWall = wallY(x); // piede sul muro reale
        const zUnder = g.H + (yWall - g.S) * t - run * t; // intradosso della mensola a `run` dal muro
        const F = vec3(x, yWall, zUnder - run);
        const T = intersectLinePlane(F, ax, bottom).point;
        const ref = `saetta-${i}`;
        steps.push(
          placeStep({ ref, type: "controvento", section: ss, length: norm(sub(T, F)) + ss.h, pose: fromBasis(sub(F, scale(ax, ss.h / 2)), ax, az) }),
          headCutOnPlane(ref, wall, "testa-inizio"),
          headCutOnPlane(ref, bottom, "testa-fine"),
          { kind: "hardware", code: footCode, pieces: [ref], anchor: "piede" },
          { kind: "hardware", code: BRACE_FOOT_SCREWS.code, pieces: [ref, m.ref], params: { count: BRACE_FOOT_SCREWS.count } },
        );
      });
    }
    return steps;
  },

  meta(ctx) {
    const g = geometry(ctx);
    return {
      attacco: g.attacco,
      pendenza: g.slope,
      originePendenza: g.origin,
      quotaAttacco: g.H,
      quotaGronda: g.H - g.S * Math.tan(g.a),
      mensole: g.n,
    };
  },
};
