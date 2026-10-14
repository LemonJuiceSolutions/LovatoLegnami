import { describe, expect, it } from "vitest";
import { identity } from "../math/mat4";
import { MachiningError } from "./errors";
import { addMachining, createMachining } from "./machinings";
import { createPiece, parsePiece } from "./schemas";
import type { MachiningSpec } from "./types";

const pilastro = createPiece({ id: "PIL-01", type: "pilastro", section: { b: 90, h: 90 }, length: 2400, pose: identity() });
const asola = (over: Partial<Record<string, unknown>> = {}) =>
  ({ type: "asola-lama", face: "testa-inizio", at: 0, width: 8, height: 68, depth: 180, ...over }) as MachiningSpec;

function machiningError(fn: () => unknown): MachiningError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(MachiningError);
    return e as MachiningError;
  }
  throw new Error("nessun errore lanciato");
}

describe("asola per lama (1.4)", () => {
  it("asola 8×68×180 dalla testa-inizio di un pilastro 90×90×2400 accettata e registrata sulla testa", () => {
    const p = addMachining(pilastro, asola());
    expect(p.machinings).toEqual([
      { id: "PIL-01-L01", pieceId: "PIL-01", type: "asola-lama", face: "testa-inizio", at: 0, width: 8, height: 68, depth: 180 },
    ]);
    expect(parsePiece(p)).toEqual(p);
    // dalla testa finale e con scostamento entro la sezione
    expect(createMachining(pilastro, asola({ face: "testa-fine", at: 2400, offset: 10 })).face).toBe("testa-fine");
  });

  it("width 100 su base 90 → rifiutata citando width", () => {
    const e = machiningError(() => createMachining(pilastro, asola({ width: 100 })));
    expect(e.machiningType).toBe("asola-lama");
    expect(e.message).toMatch(/width 100 non inferiore alla base della sezione \(90\)/);
  });

  it.each([
    ["height", { height: 90 }, /height 90/],
    ["depth", { depth: 2400 }, /depth 2400/],
    ["offset", { offset: 20 }, /offset 20/],
    ["at", { at: 100 }, /deve partire dalla testa/],
    ["face", { face: "superiore" }, /face/],
  ])("%s non ammesso → errore", (_, over, re) => {
    expect(machiningError(() => createMachining(pilastro, asola(over))).message).toMatch(re);
  });
});
