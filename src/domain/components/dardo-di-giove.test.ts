import { describe, expect, it } from "vitest";
import { multiply, rotationX, rotationZ, translation } from "../math/mat4";
import { vec3 } from "../math/vec3";
import { JointError, MachiningError } from "./errors";
import { expandJoint } from "./joints";
import { createMachining } from "./machinings";
import { createPiece, parseJoint } from "./schemas";
import type { DardoDiGiove, Joint, MachiningSpec } from "./types";

const section = { b: 45, h: 145 };
// due correnti lungo X che si sovrappongono di 300 sopra un appoggio in x = 3000
const a = createPiece({ id: "TRV-01", type: "trave", section, length: 3150, pose: translation(vec3(0, 0, 2500)) });
const b = createPiece({ id: "TRV-02", type: "trave", section, length: 3000, pose: translation(vec3(2850, 0, 2500)) });
const joint: Joint = { id: "G-01", type: "dardo-di-giove", pieceA: "TRV-01", pieceB: "TRV-02", params: { length: 300, angle: 15, step: 30 } };

const dardoOf = (pieces: readonly { machinings: readonly unknown[] }[], i: number) => pieces[i].machinings[0] as DardoDiGiove;

function errorOf<E>(cls: new (...args: never[]) => E, fn: () => unknown): E {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(cls);
    return e as E;
  }
  throw new Error("nessun errore lanciato");
}

describe("dardo di Giove (1.5)", () => {
  it("lavorazione: applicabilità di length, step e angle", () => {
    const spec = (over: object) => ({ type: "dardo-di-giove", face: "testa-fine", at: 3150, length: 300, angle: 15, step: 30, ...over }) as MachiningSpec;
    expect(createMachining(a, spec({})).type).toBe("dardo-di-giove");
    expect((createMachining(a, spec({ angle: -45, length: 100 })) as DardoDiGiove).angle).toBe(-45);
    const err = (over: object) => errorOf(MachiningError, () => createMachining(a, spec(over))).message;
    expect(err({ length: 3150 })).toMatch(/length 3150 non inferiore alla lunghezza/);
    expect(err({ step: 72.5 })).toMatch(/step 72.5 non inferiore a metà/);
    expect(err({ angle: 0 })).toMatch(/angle 0° non valido/);
    expect(err({ angle: 50 })).toMatch(/angle 50° non valido/);
    expect(err({ at: 3000 })).toMatch(/deve stare sulla testa/);
    expect(err({ length: 1000, angle: 30 })).toMatch(/profilo più alto della sezione/);
  });

  it("giunto valido nello schema; angolo oltre 45° rifiutato", () => {
    expect(parseJoint(joint)).toEqual(joint);
    expect(() => parseJoint({ ...joint, params: { length: 300, angle: 60, step: 30 } })).toThrow(/params.angle/);
  });

  it("due travi 45×145 collineari → due dardo-di-giove complementari sulle teste affacciate", () => {
    const out = expandJoint(joint, [a, b]);
    const ma = dardoOf(out, 0);
    const mb = dardoOf(out, 1);
    expect(ma).toMatchObject({ face: "testa-fine", at: 3150, length: 300, angle: 15, step: 30, jointId: "G-01" });
    expect(mb).toMatchObject({ face: "testa-inizio", at: 0, length: 300, angle: -15, step: 30, jointId: "G-01" });
  });

  it("pezzo B rovesciato (asse X opposto e Z verso il basso) → stesso angolo, testa finale", () => {
    // X opposto e Z capovolto = rotazione di 180° attorno a Y
    const flipped = createPiece({
      id: "TRV-02",
      type: "trave",
      section,
      length: 3000,
      pose: multiply(translation(vec3(5850, 0, 2500)), [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1]),
    });
    const out = expandJoint(joint, [a, flipped]);
    expect(dardoOf(out, 1)).toMatchObject({ face: "testa-fine", at: 3000, angle: 15 });
    // X opposto con Z verso l'alto (rotazione attorno a Z) → angolo opposto
    const turned = createPiece({ id: "TRV-02", type: "trave", section, length: 3000, pose: multiply(translation(vec3(5850, 0, 2500)), rotationZ(Math.PI)) });
    expect(dardoOf(expandJoint(joint, [a, turned]), 1)).toMatchObject({ face: "testa-fine", angle: -15 });
  });

  it("pezzi non collineari → JointError che cita il giunto", () => {
    const skew = createPiece({ id: "TRV-02", type: "trave", section, length: 3000, pose: multiply(translation(vec3(2850, 0, 2500)), rotationZ(0.01)) });
    const e1 = errorOf(JointError, () => expandJoint(joint, [a, skew]));
    expect(e1.jointId).toBe("G-01");
    expect(e1.message).toMatch(/Giunto G-01: .*non sono collineari/);
    const shifted = createPiece({ id: "TRV-02", type: "trave", section, length: 3000, pose: translation(vec3(2850, 5, 2500)) });
    expect(errorOf(JointError, () => expandJoint(joint, [a, shifted])).message).toMatch(/non sono collineari/);
    const rolled = createPiece({ id: "TRV-02", type: "trave", section, length: 3000, pose: multiply(translation(vec3(2850, 0, 2500)), rotationX(Math.PI / 2)) });
    expect(errorOf(JointError, () => expandJoint(joint, [a, rolled])).message).toMatch(/non sono parallele/);
  });

  it("sovrapposizione diversa da length o assente → JointError", () => {
    const short = createPiece({ id: "TRV-02", type: "trave", section, length: 3000, pose: translation(vec3(3000, 0, 2500)) });
    expect(errorOf(JointError, () => expandJoint(joint, [a, short])).message).toMatch(/sovrapposizione delle teste 150 mm diversa/);
    const apart = createPiece({ id: "TRV-02", type: "trave", section, length: 3000, pose: translation(vec3(3500, 0, 2500)) });
    expect(errorOf(JointError, () => expandJoint(joint, [a, apart])).message).toMatch(/non si sovrappongono/);
  });
});
