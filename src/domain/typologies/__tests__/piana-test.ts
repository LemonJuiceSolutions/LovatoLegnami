import { fromBasis, translation } from "../../math/mat4";
import { vec3 } from "../../math/vec3";
import type { TypologyTemplate } from "../template";

/**
 * Template minimale "piana-test" (solo pilastri e travi): due file di
 * pilastri e una trave per fila. Usato nei test dell'interprete e del registro.
 */
export const pianaTest: TypologyTemplate = {
  slug: "piana-test",
  name: "Piana (test)",
  description: "Due file di pilastri con trave: template minimale per i test.",
  params: [
    { kind: "number", name: "larghezza", label: "Larghezza", unit: "mm", min: 2000, max: 8000, default: 4000 },
    { kind: "number", name: "profondita", label: "Profondità", unit: "mm", min: 1500, max: 5000, default: 3000 },
    { kind: "number", name: "altezza", label: "Altezza sotto trave", unit: "mm", min: 2000, max: 3500, default: 2400 },
    { kind: "number", name: "campate", label: "Campate", unit: "n", min: 1, max: 4, default: 2, integer: true },
    { kind: "section", name: "sezionePilastro", label: "Sezione pilastri", pieceType: "pilastro", default: "120×120" },
    { kind: "section", name: "sezioneTrave", label: "Sezione travi", pieceType: "trave", default: "120×240" },
  ],
  build(ctx) {
    const W = ctx.num("larghezza");
    const D = ctx.num("profondita");
    const H = ctx.num("altezza");
    const n = ctx.num("campate");
    const sp = ctx.section("sezionePilastro");
    const st = ctx.section("sezioneTrave");
    const rows = [st.b / 2, D - st.b / 2];
    return rows.flatMap((y, r) => [
      {
        kind: "repeat" as const,
        count: n + 1,
        each: (i: number) => {
          const x = sp.b / 2 + (i * (W - sp.b)) / n;
          return {
            kind: "place" as const,
            ref: `pilastro-${r}-${i}`,
            type: "pilastro" as const,
            section: sp,
            length: H - ctx.floorHeightAt(x, y),
            pose: fromBasis(vec3(x, y, ctx.floorHeightAt(x, y)), vec3(0, 0, 1), vec3(0, 1, 0)),
          };
        },
      },
      {
        kind: "place" as const,
        ref: `trave-${r}`,
        type: "trave" as const,
        section: st,
        length: W,
        pose: translation(vec3(0, y, H + st.h / 2)),
      },
    ]);
  },
};
