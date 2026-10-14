// Test end-to-end dominio + export (13.1): dalle tipologie di default alla
// distinta CSV e al SAT validato, senza kernel WASM (B-rep neutra a box in TS).
import { describe, expect, it } from "vitest";
import { checkCollisions, DEFAULT_LOVATO_RULES, evaluateRules, floorFunction, generate, listTypologies } from "@/domain";
import { pieceBoxBrep } from "@/geometry/neutral-brep-box";
import type { PieceResult } from "@/geometry/protocol";
import { buildDistinta } from "@/export/csv";
import { exportSat, validateSat } from "@/export/sat";
import { defaultConfig } from "@/stores/config";

const date = new Date(2026, 9, 14, 9, 30, 0);
const SLUGS = ["addossata-monofalda", "autoportante-bifalda"] as const;

function pipeline(slug: string) {
  const { envelope } = defaultConfig(slug);
  const floorHeightAt = floorFunction(envelope);
  const assembly = generate(slug, {}, { floorHeightAt });
  const rules = evaluateRules(assembly, DEFAULT_LOVATO_RULES, { floorHeightAt });
  const collisions = checkCollisions(assembly, envelope);
  const distinta = buildDistinta(assembly);
  const results: PieceResult[] = assembly.pieces.map((p) => ({
    pieceId: p.id,
    cacheKey: p.id,
    pose: p.pose,
    brep: pieceBoxBrep(p.section, p.length),
  }));
  return { assembly, rules, collisions, distinta, results };
}

describe("pipeline dominio → export", () => {
  it("le tipologie registrate includono quelle attese", () => {
    // le tipologie di `tipologie-estese` hanno la propria pipeline (task 9.3)
    expect(listTypologies().map((t) => t.slug)).toEqual(expect.arrayContaining([...SLUGS]));
  });

  it.each(SLUGS)("%s di default: zero errori di regole e collisioni", (slug) => {
    const { assembly, rules, collisions } = pipeline(slug);
    expect(assembly.pieces.length).toBeGreaterThan(10);
    expect(rules.violations.filter((v) => v.severity === "errore")).toEqual([]);
    expect(rules.valid).toBe(true);
    expect(collisions).toEqual([]);
  });

  it.each(SLUGS)("%s di default: distinta CSV coerente con i pezzi", (slug) => {
    const { assembly, distinta } = pipeline(slug);
    const lines = distinta.csv.trimEnd().split("\r\n");
    expect(lines.length).toBe(distinta.rows.length + 1);
    const total = distinta.rows.reduce((s, r) => s + r.quantity, 0);
    expect(total).toBe(assembly.pieces.length);
    const ids = distinta.rows.flatMap((r) => r.ids).sort();
    expect(ids).toEqual(assembly.pieces.map((p) => p.id).sort());
  });

  it.each(SLUGS)("%s di default: SAT assieme unico valido con un body per pezzo", (slug) => {
    const { assembly, results } = pipeline(slug);
    const out = exportSat(assembly.pieces, results, { date });
    expect(out.errors).toEqual([]);
    expect(out.extension).toBe("sat");
    const v = validateSat(out.data as string);
    expect(v.errors).toEqual([]);
    expect(v.counts.body).toBe(assembly.pieces.length);
    expect(v.bodies.map((b) => b.name)).toEqual(assembly.pieces.map((p) => p.id));
  });

  it.each(SLUGS)("%s di default: SAT un file per pezzo (ZIP), ogni file valido", (slug) => {
    const { assembly, results } = pipeline(slug);
    const out = exportSat(assembly.pieces, results, { date, fileMode: "un-file-per-pezzo" });
    expect(out.errors).toEqual([]);
    expect(out.extension).toBe("zip");
    expect(out.data).toBeInstanceOf(Uint8Array);
    expect(out.files.length).toBe(assembly.pieces.length);
    for (const f of out.files) {
      const v = validateSat(f.text);
      expect(v.errors, f.name).toEqual([]);
      expect(v.counts.body).toBe(1);
      expect(v.bodies[0].name).toBe(f.pieceIds[0]);
    }
  });

  it.each(["4.0", "7.0", "21.0"] as const)("versione ACIS %s: SAT della bifalda valido", (version) => {
    const { assembly, results } = pipeline("autoportante-bifalda");
    const out = exportSat(assembly.pieces, results, { date, version });
    expect(out.errors).toEqual([]);
    expect(validateSat(out.data as string).errors).toEqual([]);
  });
});
