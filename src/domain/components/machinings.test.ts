import { describe, expect, it } from "vitest";
import { identity } from "../math/mat4";
import { MachiningError } from "./errors";
import { addMachining, createMachining } from "./machinings";
import { createPiece } from "./schemas";
import type { MachiningSpec } from "./types";

const travetto = createPiece({ id: "TVT-01", type: "travetto", section: { b: 80, h: 160 }, length: 3500, pose: identity() });

function machiningError(fn: () => unknown): MachiningError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(MachiningError);
    return e as MachiningError;
  }
  throw new Error("nessun errore lanciato");
}

describe("lavorazioni", () => {
  it("becco d'uccello valido registrato sul pezzo con i suoi parametri", () => {
    const p = addMachining(travetto, { type: "becco-uccello", depth: 30, angle: 18, at: 350, face: "inferiore" });
    expect(p.machinings).toEqual([
      { id: "TVT-01-L01", pieceId: "TVT-01", type: "becco-uccello", depth: 30, angle: 18, at: 350, face: "inferiore" },
    ]);
    expect(travetto.machinings).toEqual([]); // immutabile
    const p2 = addMachining(p, { type: "taglio-testa", angle: 15, at: 3500, face: "testa-fine" });
    expect(p2.machinings.map((m) => m.id)).toEqual(["TVT-01-L01", "TVT-01-L02"]);
  });

  it("lavorazione oltre la lunghezza → errore con id pezzo e lavorazione", () => {
    const e = machiningError(() =>
      createMachining(travetto, { type: "becco-uccello", depth: 30, angle: 18, at: 3600, face: "inferiore" }),
    );
    expect(e.pieceId).toBe("TVT-01");
    expect(e.machiningType).toBe("becco-uccello");
    expect(e.message).toMatch(/TVT-01/);
    expect(e.message).toMatch(/becco-uccello/);
  });

  it("profondità maggiore della sezione → errore", () => {
    expect(() => createMachining(travetto, { type: "becco-uccello", depth: 170, angle: 18, at: 350, face: "inferiore" })).toThrow(
      /profondità/,
    );
    // sulla faccia laterale lo spessore è la base (80)
    expect(() => createMachining(travetto, { type: "mezzo-legno", width: 100, depth: 90, at: 500, face: "sinistra" })).toThrow(
      MachiningError,
    );
    expect(createMachining(travetto, { type: "mezzo-legno", width: 100, depth: 80, at: 500, face: "superiore" }).type).toBe(
      "mezzo-legno",
    );
  });

  it("tipo sconosciuto → errore esplicito", () => {
    const e = machiningError(() => createMachining(travetto, { type: "fresatura", at: 10, face: "superiore" } as unknown as MachiningSpec));
    expect(e.message).toMatch(/tipo di lavorazione sconosciuto: "fresatura"/);
  });

  it("parametri non validi → errore con campo", () => {
    expect(() => createMachining(travetto, { type: "foro", diameter: -1, offset: 0, at: 10, face: "superiore" })).toThrow(
      /diameter/,
    );
  });

  it("foro entro la faccia", () => {
    const ok: MachiningSpec = { type: "foro", diameter: 12, offset: 0, at: 100, face: "superiore" };
    expect(createMachining(travetto, ok).type).toBe("foro");
    expect(() => createMachining(travetto, { ...ok, at: 3, face: "superiore" })).toThrow(/lunghezza/);
    expect(() => createMachining(travetto, { ...ok, offset: 36 })).toThrow(/faccia/); // 36+6 > 40
    expect(() => createMachining(travetto, { ...ok, depth: 200 })).toThrow(/profondità/);
    expect(createMachining(travetto, { ...ok, offset: 70, face: "sinistra" }).type).toBe("foro"); // faccia alta 160
  });

  it("tenone e taglio di testa: solo sulle teste, coerenti con la posizione", () => {
    const t: MachiningSpec = { type: "tenone", width: 40, height: 80, length: 60, at: 0, face: "testa-inizio" };
    expect(createMachining(travetto, t).type).toBe("tenone");
    expect(() => createMachining(travetto, { ...t, at: 3500 })).toThrow(/testa/);
    expect(() => createMachining(travetto, { ...t, width: 90 })).toThrow(/sezione/);
    expect(() => createMachining(travetto, { type: "taglio-testa", angle: 90, at: 3500, face: "testa-fine" })).toThrow(/angolo/);
    expect(() => createMachining(travetto, { type: "taglio-testa", angle: 89, at: 3500, face: "testa-fine" })).toThrow(
      /lunghezza/,
    );
  });

  it("mortasa ruotata: ingombro sulla faccia verificato", () => {
    const m: MachiningSpec = { type: "mortasa", width: 41, height: 81, depth: 61, offset: 0, angle: 90, at: 1000, face: "superiore" };
    expect(createMachining(travetto, m).type).toBe("mortasa");
    // angolo 0: height (81) trasversale > base 80
    expect(() => createMachining(travetto, { ...m, angle: 0 })).toThrow(/faccia/);
    expect(() => createMachining(travetto, { ...m, angle: 180 })).toThrow(/angolo/);
  });
});
