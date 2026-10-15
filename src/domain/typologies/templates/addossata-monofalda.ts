import { degToRad } from "../../math/mat4";
import type { BuildContext, BuildStep, TypologyTemplate } from "../template";
import {
  alongX,
  braceLeg,
  braceSteps,
  columnStep,
  commonParams,
  joistSpaces,
  joistSteps,
  numberParam,
  seatOffset,
  sectionParam,
  spread,
  type Falda,
} from "./shared";

/** Diametro dei fori per ancoranti a muro della banchina (M12, mm). */
const DIAMETRO_FORI = 14;
/** Distanza minima dei fori dalle teste della banchina (mm). */
const MARGINE_FORI = 150;

/**
 * Geometria della monofalda addossata (sezione trasversale nel piano Y–Z):
 *
 * - trave di fronte con asse a `yT`, intradosso a quota `altezza`, su
 *   `campate + 1` pilastri; banchina a muro con asse a `yT + profondita` e
 *   faccia posteriore sul muro (`yMuro`);
 * - travetti che salgono verso il muro con la pendenza data, appoggiati con
 *   becco d'uccello su trave e banchina; tagli a piombo in gronda e in testa
 *   (con il box non lavorato a filo muro);
 * - il punto più avanzato dell'assieme (spigolo superiore della gronda) è a y = 0.
 *
 * `profondita` è la distanza orizzontale tra gli assi di trave e banchina:
 * il dislivello tra le facce superiori di banchina e trave è
 * `profondita·tan(pendenza)`.
 */
function geometry(ctx: BuildContext) {
  const W = ctx.num("larghezza");
  const P = ctx.num("profondita");
  const H = ctx.num("altezza");
  const slope = ctx.num("pendenza");
  const sbalzo = ctx.num("sbalzo");
  const st = ctx.section("sezioneTrave");
  const sb = ctx.section("sezioneBanchina");
  const sj = ctx.section("sezioneTravetto");
  const s = degToRad(slope);
  const c = seatOffset(slope, [st.b, sb.b], sj);
  const uEdgeTrave = sbalzo + sj.h * Math.sin(s); // faccia esterna della trave
  const yT = uEdgeTrave + st.b / 2;
  const yB = yT + P;
  const yMuro = yB + sb.b / 2;
  const zTopTrave = H + st.h;
  const underside = (u: number) => zTopTrave - c / Math.cos(s) + (u - yT) * Math.tan(s);
  const zTopBanchina = underside(yB) + c / Math.cos(s);
  return { W, P, H, slope, s, sbalzo, st, sb, sj, yT, yB, yMuro, zTopTrave, zTopBanchina, underside, uEdgeTrave };
}

export const addossataMonofalda: TypologyTemplate = {
  slug: "addossata-monofalda",
  name: "Addossata monofalda",
  description:
    "Pergola addossata a un muro: banchina a muro, trave di fronte su pilastri, travetti inclinati con sbalzo di gronda e saette.",
  category: "addossata",
  tags: ["monofalda", "banchina", "carpenteria", "travetti inclinati"],
  reference: "T-B (addossata monofalda, change configuratore-pergole)",
  params: [
    ...commonParams({
      larghezza: 6000,
      profondita: 3000,
      profonditaLabel: "Profondità (asse banchina – asse trave)",
      pendenza: 15,
      interasse: 600,
    }),
    sectionParam("sezioneBanchina", "Sezione banchina", "banchina", "100×200"),
    numberParam("passoFori", "Passo fori banchina", "mm", 200, 2000, 600, 10, {
      description: "Passo massimo degli ancoranti a muro della banchina.",
    }),
  ],

  build(ctx) {
    const g = geometry(ctx);
    const sp = ctx.section("sezionePilastro");
    const sc = ctx.section("sezioneControvento");
    const campate = ctx.num("campate");
    const lateral = ctx.num("sbalzoLaterale");
    const steps: BuildStep[] = [];

    // banchina a muro con fori passanti per ancoranti, a passo ≤ passoFori
    steps.push({ kind: "place", ref: "banchina", type: "banchina", section: g.sb, length: g.W, pose: alongX(0, g.yB, g.zTopBanchina - g.sb.h / 2) });
    const m = Math.min(MARGINE_FORI, g.W / 4);
    const nFori = Math.max(2, Math.ceil((g.W - 2 * m) / ctx.num("passoFori") - 1e-9) + 1);
    steps.push({
      kind: "repeat",
      count: nFori,
      each: (i) => ({
        kind: "machining",
        target: "banchina",
        spec: { type: "foro", face: "destra", diameter: DIAMETRO_FORI, offset: 0, at: m + (i * (g.W - 2 * m)) / (nFori - 1) },
      }),
    });

    // trave di fronte e pilastri (le facce esterne dei pilastri d'estremità a `sbalzoLaterale` dalle teste)
    steps.push({ kind: "place", ref: "trave", type: "trave", section: g.st, length: g.W, pose: alongX(0, g.yT, g.H + g.st.h / 2) });
    const postXs = spread(lateral, g.W - lateral, sp.b, campate);
    postXs.forEach((x, i) => steps.push(columnStep(ctx, `pilastro-${i}`, x, g.yT, g.H, sp)));

    // travetti dalla gronda al muro
    const falda: Falda = { dir: 1, yOf: (u) => u, slope: g.slope, underside: g.underside };
    const seats = [
      { u: g.uEdgeTrave, z: g.zTopTrave },
      { u: g.yMuro - g.sb.b, z: g.zTopBanchina },
    ];
    const xs = spread(0, g.W, g.sj.b, joistSpaces(g.W - g.sj.b, ctx.num("interasse")));
    const uTop = g.yMuro - g.sj.h * Math.sin(g.s);
    xs.forEach((x, i) => steps.push(...joistSteps(`travetto-${i}`, x, falda, g.sj, g.uEdgeTrave - g.sbalzo, uTop, seats)));

    // saette tra pilastri e trave
    if (ctx.bool("controventi")) {
      const campata = campate > 0 ? (g.W - 2 * lateral - sp.b) / campate : 0;
      const leg = braceLeg({ saetta: ctx.num("saetta"), sbalzoLaterale: lateral, campata, altezza: g.H, sp, sc });
      steps.push(...braceSteps("saetta", postXs, g.yT, g.H, leg, sp, sc));
    }
    return steps;
  },

  meta(ctx) {
    const g = geometry(ctx);
    return { quotaImposta: g.H, dislivello: g.zTopBanchina - g.zTopTrave, yMuro: g.yMuro };
  },
};
