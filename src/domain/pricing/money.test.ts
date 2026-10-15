import { describe, expect, it } from "vitest";
import { canonicalJson as fromGeometry } from "@/geometry/cache";
import { canonicalJson } from "@/domain/math/canonical";
import {
  EURO_SEPARATOR,
  MoneyError,
  add,
  cents,
  formatEuro,
  fromEuro,
  mul,
  percent,
  roundHalfUp,
  roundToStep,
  sub,
  sum,
} from "./money";

const plain = (s: string) => s.replace(EURO_SEPARATOR, " ");

describe("money", () => {
  it("un terzo di 1000 centesimi → 333", () => {
    expect(mul(1000, 1 / 3)).toBe(333);
    expect(mul(1000, 2 / 3)).toBe(667);
  });

  it("mezzo centesimo arrotonda per eccesso (lontano da zero)", () => {
    expect(mul(1, 0.5)).toBe(1);
    expect(mul(3, 0.5)).toBe(2);
    expect(mul(-1, 0.5)).toBe(-1);
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(-2.5)).toBe(-3);
    expect(roundHalfUp(-0.4)).toBe(0);
    expect(Object.is(roundHalfUp(-0.4), -0)).toBe(false);
  });

  it("il rumore binario non sposta la metà", () => {
    expect(fromEuro(1.005)).toBe(101);
    expect(mul(100, 1.005)).toBe(101);
  });

  it("percentuali, somme e differenze su interi", () => {
    expect(percent(473180, 22)).toBe(104100);
    expect(percent(1000, 15)).toBe(150);
    expect(add(100, 250, -50)).toBe(300);
    expect(sum([])).toBe(0);
    expect(sub(1000, 333)).toBe(667);
  });

  it("rifiuta importi non interi", () => {
    expect(() => cents(1.5)).toThrow(MoneyError);
    expect(() => add(1, 0.1)).toThrow(MoneyError);
    expect(() => mul(Number.NaN, 2)).toThrow(MoneyError);
  });

  it("roundToStep al passo più vicino", () => {
    expect(roundToStep(473180, 1000)).toBe(473000);
    expect(roundToStep(473500, 1000)).toBe(474000);
    expect(roundToStep(473499, 1000)).toBe(473000);
    expect(roundToStep(-473500, 1000)).toBe(-474000);
    expect(() => roundToStep(100, 0)).toThrow(MoneyError);
  });

  it("formatEuro in italiano", () => {
    expect(plain(formatEuro(473000))).toBe("4.730,00 €");
    expect(formatEuro(473000)).toBe("4.730,00 €");
    expect(plain(formatEuro(5))).toBe("0,05 €");
    expect(plain(formatEuro(123456789))).toBe("1.234.567,89 €");
    expect(plain(formatEuro(-150))).toBe("-1,50 €");
    expect(plain(formatEuro(0))).toBe("0,00 €");
  });

  it("canonicalJson è in domain/math e riesportato da geometry/cache", () => {
    expect(fromGeometry).toBe(canonicalJson);
    expect(canonicalJson({ b: 1, a: [2, { d: -0, c: 1.0000000001 }], u: undefined })).toBe('{"a":[2,{"c":1,"d":0}],"b":1}');
  });
});
