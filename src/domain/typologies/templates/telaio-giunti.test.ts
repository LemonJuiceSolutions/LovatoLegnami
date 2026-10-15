import { describe, expect, it } from "vitest";
import { measureAssembly } from "../../assembly/measures";
import type { Assembly, Piece } from "../../components/types";
import { findHardware } from "../../hardware/catalog";
import { applyToPoint, axisOf } from "../../math/mat4";
import { vec3 } from "../../math/vec3";
import { DEFAULT_LOVATO_RULES } from "../../rules/data/default-lovato";
import { evaluateRules } from "../../rules/engine";
import { generate, listTypologies } from "../registry";

const SLUG = "telaio-giunti";
const ofType = (a: Assembly, t: Piece["type"]) => a.pieces.filter((p) => p.type === t);
const codes = (a: Assembly, prefix: string) => a.hardware.filter((h) => h.code.startsWith(prefix)).map((h) => h.code);
const errors = (a: Assembly) => evaluateRules(a, DEFAULT_LOVATO_RULES).violations.filter((v) => v.severity === "errore");
const moderna = { larghezza: 2580, profondita: 2580, campate: 1, campateProfondita: 1, sezioneAsta: "90×90", forma: "piana", fissaggio: "libera" };

describe("telaio-giunti", () => {
  it("registrata con categoria autoportante e riferimento T-D", () => {
    expect(listTypologies().find((t) => t.slug === SLUG)).toMatchObject({ category: "autoportante", reference: "T-D" });
  });

  it("moderna 258×258: 10 aste 90×90 da 2400, 4 giunti 3A, 4 giunti 3L, 4 staffe a terra, 160 viti", () => {
    const a = generate(SLUG, moderna);
    expect(a.pieces).toHaveLength(10);
    expect(a.pieces.every((p) => p.section.b === 90 && p.section.h === 90)).toBe(true);
    expect(a.pieces.map((p) => Math.round(p.length * 1e6) / 1e6)).toEqual(Array(10).fill(2400));
    expect(ofType(a, "pilastro")).toHaveLength(4);
    expect(codes(a, "giunto-joint-3a-")).toEqual(Array(4).fill("giunto-joint-3a-vie-90-90"));
    expect(codes(a, "giunto-joint-3l-")).toEqual(Array(4).fill("giunto-joint-3l-vie-90-90"));
    expect(a.hardware.filter((h) => h.kind === "staffa-terra").map((h) => h.code)).toEqual(Array(4).fill("staffa-terra-joint-90"));
    expect(a.hardware.find((h) => h.code === "vite-6x40")?.quantity).toBe(160);
    // tutte le aste a squadra: nessuna lavorazione nel legno
    expect(a.pieces.every((p) => p.machinings.length === 0)).toBe(true);
    expect(errors(a)).toEqual([]);
  });

  it("lunghezza delle travi = interasse − 2·(A/2 − i) della voce usata", () => {
    const a = generate(SLUG, { ...moderna, larghezza: 3180 });
    const j = findHardware("giunto-joint-3a-vie-90-90").joint!;
    const front = ofType(a, "trave").find((p) => Math.abs(axisOf(p.pose, 0).x - 1) < 1e-9)!;
    expect(front.length).toBeCloseTo(3180 - 2 * (j.node / 2 - j.insertion), 9);
    // i nodi danno appoggio alle travi: luce = lunghezza tra i giunti
    const span = measureAssembly(a).spans.find((s) => s.pieceId === front.id)!;
    expect(span.supports.length).toBeGreaterThanOrEqual(2);
  });

  it("monofalda 15°: fila alta rialzata di profondita·tan 15° e nodi a 75°/105°", () => {
    const a = generate(SLUG, { ...moderna, forma: "monofalda-15" });
    const posts = ofType(a, "pilastro");
    const yOf = (p: Piece) => applyToPoint(p.pose, vec3(0, 0, 0)).y;
    const front = posts.filter((p) => yOf(p) < 100);
    const back = posts.filter((p) => yOf(p) > 100);
    expect(back[0].length - front[0].length).toBeCloseTo(2580 * Math.tan((15 * Math.PI) / 180), 6);
    expect(codes(a, "giunto-joint-3a-").sort()).toEqual([...Array(2).fill("giunto-joint-3a-vie-90-105"), ...Array(2).fill("giunto-joint-3a-vie-90-75")]);
    const inclined = ofType(a, "trave").filter((p) => Math.abs(axisOf(p.pose, 0).z) > 1e-6);
    expect(inclined.length).toBe(4); // 2 laterali + 2 traversi
    for (const p of inclined) expect((Math.asin(axisOf(p.pose, 0).z) * 180) / Math.PI).toBeCloseTo(15, 9);
    expect(errors(a)).toEqual([]);
  });

  it("addossata: fila a muro senza pilastri, aste lungo Y con staffa per listone", () => {
    const a = generate(SLUG, { ...moderna, fissaggio: "addossata" });
    expect(ofType(a, "pilastro")).toHaveLength(2);
    expect(a.hardware.filter((h) => h.code === "staffa-listone-90")).toHaveLength(4);
    expect(codes(a, "giunto-joint-3a-")).toHaveLength(2);
    expect(codes(a, "giunto-joint-3l-")).toHaveLength(2);
    // monofalda addossata: teste a muro tagliate sul piano del muro
    const m = generate(SLUG, { ...moderna, fissaggio: "addossata", forma: "monofalda-15" });
    const wallEnds = ofType(m, "trave").filter((p) => p.machinings.some((x) => x.type === "taglio-testa"));
    expect(wallEnds).toHaveLength(4);
    for (const p of wallEnds) {
      const far = Math.max(...[0, p.length].flatMap((x) => [-45, 45].map((z) => applyToPoint(p.pose, vec3(x, 0, z)).y)));
      expect(far).toBeGreaterThan(2580); // il box grezzo supera il muro, il taglio lo riporta a filo
    }
  });

  it("griglia 2×1: pilastri intermedi con giunti a 4 vie", () => {
    const a = generate(SLUG, { ...moderna, larghezza: 4270, profondita: 3180, campate: 2 });
    expect(ofType(a, "pilastro")).toHaveLength(6);
    expect(codes(a, "giunto-joint-4-")).toHaveLength(2);
    expect(codes(a, "giunto-joint-3a-")).toHaveLength(4);
    expect(codes(a, "giunto-joint-3l-")).toHaveLength(4); // un traverso per campata
  });

  it("monofalda con aste 70×70: nessun giunto 75/105 a catalogo → errore sul parametro forma", () => {
    expect(() => generate(SLUG, { ...moderna, sezioneAsta: "70×70", forma: "monofalda-15" })).toThrow(/forma.*giunto/s);
  });
});
