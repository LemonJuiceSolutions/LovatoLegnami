import type { Section } from "../../components/types";
import { degToRad, fromBasis } from "../../math/mat4";
import { vec3 } from "../../math/vec3";
import type { BuildContext, BuildStep, TypologyTemplate } from "../template";
import {
  alongX,
  braceLeg,
  braceSteps,
  columnStep,
  commonParams,
  joistSpaces,
  joistSteps,
  seatOffset,
  sectionParam,
  spread,
  type Falda,
} from "./shared";

/** Distanza tra estradosso dei puntoni e intradosso dei travetti (mm). */
const LUCE_PUNTONI = 20;

/**
 * Geometria della bifalda autoportante (sezione trasversale nel piano Y–Z):
 *
 * - due travi longitudinali (assi a `yF` e `yF + profondita`) su due file di
 *   `campate + 1` pilastri, intradosso a quota `altezza`;
 * - colmo con asse a `yC = yF + profondita/2`, faccia superiore a
 *   `quota trave + (profondita/2)·tan(pendenza)`;
 * - travetti speculari sulle due falde, dalla gronda al piano verticale del
 *   colmo (tagli a piombo), con becco d'uccello su trave e colmo;
 * - a ogni fila di pilastri una coppia di puntoni paralleli alla falda, sotto i
 *   travetti, innestati con tenone-mortasa nel fianco interno della trave e nel
 *   fianco del colmo; la spalla del tenone tocca la faccia con lo spigolo più
 *   vicino (approssimazione MVP: spalla ortogonale all'asse);
 * - il punto più avanzato (gronda anteriore) è a y = 0, l'assieme è simmetrico
 *   rispetto al piano y = yC.
 */
function geometry(ctx: BuildContext) {
  const W = ctx.num("larghezza");
  const P = ctx.num("profondita");
  const H = ctx.num("altezza");
  const slope = ctx.num("pendenza");
  const sbalzo = ctx.num("sbalzo");
  const st = ctx.section("sezioneTrave");
  const sk = ctx.section("sezioneColmo");
  const sj = ctx.section("sezioneTravetto");
  const s = degToRad(slope);
  const c = seatOffset(slope, [st.b, sk.b], sj);
  const uEdgeTrave = sbalzo + sj.h * Math.sin(s);
  const yF = uEdgeTrave + st.b / 2;
  const yC = yF + P / 2;
  const depth = 2 * yF + P;
  const zTopTrave = H + st.h;
  const underside = (u: number) => zTopTrave - c / Math.cos(s) + (u - yF) * Math.tan(s);
  const zTopColmo = underside(yC) + c / Math.cos(s);
  return { W, P, H, slope, s, sbalzo, st, sk, sj, yF, yC, depth, zTopTrave, zTopColmo, underside, uEdgeTrave };
}

type Geometry = ReturnType<typeof geometry>;

/** Puntone di falda nel telaio in x, tra il fianco della trave e quello del colmo. */
function rafterSteps(ref: string, x: number, falda: Falda, g: Geometry, sp: Section, tenon: { width: number; height: number; length: number }): BuildStep[] {
  const [c, sn] = [Math.cos(g.s), Math.sin(g.s)];
  const axisZ = (u: number) => g.underside(u) - LUCE_PUNTONI - sp.h / (2 * c);
  const uLow = g.yF + g.st.b / 2 + (sp.h / 2) * sn; // spalla bassa: spigolo superiore sul fianco trave
  const uHigh = g.yC - g.sk.b / 2 - (sp.h / 2) * sn; // spalla alta: spigolo inferiore sul fianco colmo
  const u0 = uLow - tenon.length * c;
  const length = (uHigh - uLow) / c + 2 * tenon.length;
  const pose = fromBasis(vec3(x, falda.yOf(u0), axisZ(u0)), vec3(0, falda.dir * c, sn), vec3(0, -falda.dir * sn, c));
  const params = { ...tenon, gap: 1 };
  return [
    { kind: "place", ref, type: "puntone", section: sp, length, pose },
    { kind: "joint", type: "tenone-mortasa", a: ref, b: falda.dir > 0 ? "trave-0" : "trave-1", params },
    { kind: "joint", type: "tenone-mortasa", a: ref, b: "colmo", params },
  ];
}

export const autoportanteBifalda: TypologyTemplate = {
  slug: "autoportante-bifalda",
  name: "Autoportante bifalda",
  description:
    "Pergola autoportante a due falde: due travi su due file di pilastri, colmo su puntoni a tenone e mortasa, travetti speculari con sbalzo e saette.",
  category: "autoportante",
  tags: ["bifalda", "capanna", "colmo", "carpenteria"],
  reference: "§3 estensioni (autoportante bifalda)",
  params: [
    ...commonParams({
      larghezza: 5000,
      profondita: 4000,
      profonditaLabel: "Profondità (asse trave – asse trave)",
      pendenza: 20,
      interasse: 800,
    }),
    sectionParam("sezioneColmo", "Sezione colmo", "colmo", "120×240"),
    sectionParam("sezionePuntone", "Sezione puntoni", "puntone", "120×120"),
  ],

  build(ctx) {
    const g = geometry(ctx);
    const sp = ctx.section("sezionePilastro");
    const sr = ctx.section("sezionePuntone");
    const sc = ctx.section("sezioneControvento");
    const campate = ctx.num("campate");
    const lateral = ctx.num("sbalzoLaterale");
    const rows = [g.yF, g.depth - g.yF];
    const front: Falda = { dir: 1, yOf: (u) => u, slope: g.slope, underside: g.underside };
    const back: Falda = { dir: -1, yOf: (u) => g.depth - u, slope: g.slope, underside: g.underside };
    const steps: BuildStep[] = [];

    rows.forEach((y, r) =>
      steps.push({ kind: "place", ref: `trave-${r}`, type: "trave", section: g.st, length: g.W, pose: alongX(0, y, g.H + g.st.h / 2) }),
    );
    steps.push({ kind: "place", ref: "colmo", type: "colmo", section: g.sk, length: g.W, pose: alongX(0, g.yC, g.zTopColmo - g.sk.h / 2) });

    const postXs = spread(lateral, g.W - lateral, sp.b, campate);
    rows.forEach((y, r) => postXs.forEach((x, i) => steps.push(columnStep(ctx, `pilastro-${r}-${i}`, x, y, g.H, sp))));

    // coppie di puntoni a ogni telaio (anteriore, posteriore)
    const tenon = {
      width: Math.round(sr.b / 3),
      height: Math.round((2 * sr.h) / 3),
      length: Math.min(60, Math.min(g.st.b, g.sk.b) / 2 - 10),
    };
    postXs.forEach((x, i) => {
      steps.push(...rafterSteps(`puntone-${i}-0`, x, front, g, sr, tenon));
      steps.push(...rafterSteps(`puntone-${i}-1`, x, back, g, sr, tenon));
    });

    // travetti: falda anteriore poi posteriore, da sinistra a destra
    const xs = spread(0, g.W, g.sj.b, joistSpaces(g.W - g.sj.b, ctx.num("interasse")));
    const seats = [
      { u: g.uEdgeTrave, z: g.zTopTrave },
      { u: g.yC - g.sk.b / 2, z: g.zTopColmo },
    ];
    [front, back].forEach((falda, f) =>
      xs.forEach((x, i) => steps.push(...joistSteps(`travetto-${f}-${i}`, x, falda, g.sj, g.uEdgeTrave - g.sbalzo, g.yC, seats))),
    );

    if (ctx.bool("controventi")) {
      const campata = (g.W - 2 * lateral - sp.b) / campate;
      const leg = braceLeg({ saetta: ctx.num("saetta"), sbalzoLaterale: lateral, campata, altezza: g.H, sp, sc });
      rows.forEach((y, r) => steps.push(...braceSteps(`saetta-${r}`, postXs, y, g.H, leg, sp, sc)));
    }
    return steps;
  },

  meta(ctx) {
    const g = geometry(ctx);
    return { quotaImposta: g.H, yColmo: g.yC, quotaColmo: g.zTopColmo };
  },
};
