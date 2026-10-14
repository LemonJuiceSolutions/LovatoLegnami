import { describe, expect, it } from "vitest";
import { formatSatNumber } from "./number";

describe("formatSatNumber", () => {
  it("interi senza decimali né esponente", () => {
    expect(formatSatNumber(0)).toBe("0");
    expect(formatSatNumber(1)).toBe("1");
    expect(formatSatNumber(-2400)).toBe("-2400");
    expect(formatSatNumber(123456789012)).toBe("123456789012");
  });

  it("15 cifre significative, senza zeri finali", () => {
    expect(formatSatNumber(0.1 + 0.2)).toBe("0.3");
    expect(formatSatNumber(1 / 3)).toBe("0.333333333333333");
    expect(formatSatNumber(Math.PI)).toBe("3.14159265358979");
    expect(formatSatNumber(2 * Math.PI)).toBe("6.28318530717959");
    expect(formatSatNumber(1234.5678)).toBe("1234.5678");
    expect(formatSatNumber(-0.5)).toBe("-0.5");
    expect(formatSatNumber(2400.0000000000005)).toBe("2400");
  });

  it("niente -0: zero negativo e rumore numerico sotto 1e-12 diventano 0", () => {
    expect(formatSatNumber(-0)).toBe("0");
    expect(formatSatNumber(Math.cos(Math.PI / 2))).toBe("0");
    expect(formatSatNumber(-1e-15)).toBe("0");
    expect(formatSatNumber(-1e-13 * 0.5)).toBe("0");
  });

  it("valori piccoli ma significativi restano (esponente in stile C solo se inevitabile)", () => {
    expect(formatSatNumber(0.001)).toBe("0.001");
    expect(formatSatNumber(1e-7)).toBe("1e-7");
    expect(formatSatNumber(1e21)).toBe("1e+21");
  });

  it("rifiuta NaN e infiniti", () => {
    expect(() => formatSatNumber(Number.NaN)).toThrow(/non finito/);
    expect(() => formatSatNumber(Number.POSITIVE_INFINITY)).toThrow(/non finito/);
  });
});
