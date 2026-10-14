import { describe, expect, it } from "vitest";
import { arcLength } from "../math/arc";
import { identity } from "../math/mat4";
import { MachiningError } from "./errors";
import { addMachining, createMachining } from "./machinings";
import { createPiece } from "./schemas";
import type { MachiningSpec } from "./types";

const arco = createPiece({
  id: "ARC-01",
  type: "arco",
  section: { b: 90, h: 90 },
  length: arcLength(2400, 93),
  pose: identity(),
  curve: { radius: 2400, sweep: 93 },
});

function errorOf(fn: () => unknown): MachiningError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(MachiningError);
    return e as MachiningError;
  }
  throw new Error("nessun errore lanciato");
}

describe("lavorazioni sui pezzi curvi (1.6)", () => {
  it("foro Ø9 sulla faccia sinistra a at 3700 (coordinata curvilinea) accettato", () => {
    const p = addMachining(arco, { type: "foro", face: "sinistra", at: 3700, diameter: 9, offset: 0 });
    expect(p.machinings[0]).toMatchObject({ type: "foro", face: "sinistra", at: 3700 });
    expect(createMachining(arco, { type: "foro", face: "destra", at: 100, diameter: 13, offset: 20 }).face).toBe("destra");
    // at oltre lo sviluppo → rifiutato
    expect(errorOf(() => createMachining(arco, { type: "foro", face: "sinistra", at: 3900, diameter: 9, offset: 0 })).message).toMatch(
      /oltre la lunghezza del pezzo/,
    );
  });

  it("taglio di testa con il solo angolo nel piano di curvatura accettato", () => {
    expect(createMachining(arco, { type: "taglio-testa", face: "testa-fine", at: 3850, angle: 10 }).type).toBe("taglio-testa");
  });

  it("becco d'uccello sull'arco → \"non ammessa su pezzi curvi\"", () => {
    const e = errorOf(() => createMachining(arco, { type: "becco-uccello", face: "inferiore", at: 2000, depth: 20, angle: 10 }));
    expect(e.pieceId).toBe("ARC-01");
    expect(e.message).toMatch(/non ammessa su pezzi curvi/);
  });

  it("taglio con angle2 10 → rifiutato con il motivo", () => {
    const e = errorOf(() => createMachining(arco, { type: "taglio-testa", face: "testa-fine", at: 3850, angle: 10, angle2: 10 }));
    expect(e.message).toMatch(/sui pezzi curvi è ammesso solo l'angolo nel piano di curvatura/);
  });

  it.each([
    ["foro su superiore", { type: "foro", face: "superiore", at: 1000, diameter: 9, offset: 0 }],
    ["mezzo legno", { type: "mezzo-legno", face: "sinistra", at: 1000, width: 90, depth: 40 }],
    ["asola per lama", { type: "asola-lama", face: "testa-inizio", at: 0, width: 8, height: 68, depth: 180 }],
    ["tenone", { type: "tenone", face: "testa-inizio", at: 0, width: 30, height: 60, length: 50 }],
  ])("%s → non ammessa su pezzi curvi", (_, spec) => {
    expect(errorOf(() => createMachining(arco, spec as MachiningSpec)).message).toMatch(/non ammess[ao] su pezzi curvi/);
  });
});
