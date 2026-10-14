import { describe, expect, it } from "vitest";
import { createIdGenerator } from "../assembly/ids";
import { ValidationError } from "../components/errors";
import { translation } from "../math/mat4";
import { vec3 } from "../math/vec3";
import { HARDWARE_FAMILIES, HARDWARE_FAMILY_OF, formatHardwareId } from "./ids";
import { HARDWARE_KINDS, parseHardwareItem, parseHardwareSpec, type HardwareItem, type HardwareSpec } from "./types";

const item: HardwareItem = {
  id: "BUL-01",
  code: "bullone-m12x200",
  kind: "bullone",
  description: "Bullone passante M12×200",
  quantity: 1,
  pose: translation(vec3(0, 0, 2340)),
  pieceIds: ["TAV-01", "PIL-01", "TAV-02"],
  machiningIds: ["TAV-01-L01", "PIL-01-L01", "TAV-02-L01"],
  params: { diameter: 12, length: 200 },
};

const spec: HardwareSpec = {
  code: "staffa-terra-lama-interna-90",
  kind: "staffa-terra",
  name: "Portapilastro a lama interna 90",
  forSections: [{ b: 90, h: 90 }],
  dims: { x: 180, y: 85, z: 85 },
  holes: {
    anchor: "piede",
    features: [
      { kind: "asola", width: 8, height: 68, depth: 180 },
      { kind: "foro", axis: "y", along: 60, offset: 0, diameter: 13 },
    ],
  },
  source: "ricerca-chepergola.md §2.2",
  validation: "DA VALIDARE CON UFFICIO TECNICO",
};

function errorOf(fn: () => unknown): ValidationError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ValidationError);
    return e as ValidationError;
  }
  throw new Error("nessun errore lanciato");
}

describe("tipi della ferramenta (2.1)", () => {
  it("voce valida accettata (elenco e catalogo)", () => {
    expect(parseHardwareItem(item)).toEqual(item);
    expect(parseHardwareSpec(spec)).toEqual(spec);
  });

  it("kind sconosciuto → rifiutato con percorso", () => {
    const e = errorOf(() => parseHardwareItem({ ...item, kind: "chiodo" }));
    expect(e.issues.map((i) => i.path)).toEqual(["kind"]);
    const e2 = errorOf(() => parseHardwareSpec({ ...spec, kind: "chiodo" }));
    expect(e2.issues.map((i) => i.path)).toEqual(["kind"]);
    expect(e2.message).toMatch(/tipo di ferramenta non supportato: "chiodo"/);
    const e3 = errorOf(() => parseHardwareSpec({ ...spec, holes: { anchor: "lato", features: [{ kind: "foro", axis: "x" }] } }));
    expect(e3.issues.map((i) => i.path)).toEqual(expect.arrayContaining(["holes.anchor"]));
  });

  it("catalogo senza fonte → rifiutato", () => {
    expect(errorOf(() => parseHardwareSpec({ ...spec, source: "" })).issues.map((i) => i.path)).toEqual(["source"]);
  });

  it("famiglie: una per tipo, id BUL-01, BUL-02, STT-01 in ordine", () => {
    expect(new Set(HARDWARE_KINDS.map((k) => HARDWARE_FAMILY_OF[k]))).toEqual(new Set(HARDWARE_FAMILIES));
    const g = createIdGenerator();
    expect([g.nextHardware("bullone"), g.nextHardware("BUL"), g.nextHardware("staffa-terra")]).toEqual(["BUL-01", "BUL-02", "STT-01"]);
    // i contatori della ferramenta sono indipendenti da pezzi e giunti
    expect(g.nextPiece("pilastro")).toBe("PIL-01");
    expect(g.nextJoint()).toBe("G-01");
    expect(formatHardwareId("GNT", 12)).toBe("GNT-12");
    expect(() => g.nextHardware("XYZ" as never)).toThrow(/ferramenta sconosciuto/);
  });
});
