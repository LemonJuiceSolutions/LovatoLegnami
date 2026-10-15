// Pipeline dominio → export delle tipologie estese (task 9.3 di `tipologie-estese`):
// per ogni nuova tipologia con i default, B-rep neutra in TS (box per i dritti,
// `arcBrep` per i curvi), SAT assieme unico e per pezzo validati, un body per
// pezzo di legno (la ferramenta non produce body) e distinta con le due tabelle.
import { describe, expect, it } from "vitest";
import { generate, listTypologies } from "@/domain";
import type { Assembly, Piece } from "@/domain/components/types";
import { arcBrep, pieceBoxBrep } from "@/geometry/neutral-brep-box";
import type { PieceResult } from "@/geometry/protocol";
import { buildDistinta, HARDWARE_COLUMNS } from "@/export/csv";
import { exportSat, validateSat } from "@/export/sat";

const date = new Date(2026, 9, 14, 9, 30, 0);
const MVP = new Set(["addossata-monofalda", "autoportante-bifalda"]);
const SLUGS = listTypologies()
  .map((t) => t.slug)
  .filter((s) => !MVP.has(s));

const neutralBrep = (p: Piece) => (p.curve ? arcBrep(p.section, p.curve.radius, p.curve.sweep) : pieceBoxBrep(p.section, p.length));

const results = (assembly: Pick<Assembly, "pieces">): PieceResult[] =>
  assembly.pieces.map((p) => ({ pieceId: p.id, cacheKey: p.id, pose: p.pose, brep: neutralBrep(p) }));

describe("pipeline tipologie estese → export", () => {
  it("sono le 8 tipologie nuove", () => {
    expect(SLUGS).toHaveLength(8);
    expect(SLUGS).toEqual(expect.arrayContaining(["portale-sandwich", "carport-arco", "gazebo-padiglione", "telaio-giunti"]));
  });

  it.each(SLUGS)("%s di default: SAT assieme unico valido con un body per pezzo (ferramenta esclusa)", (slug) => {
    const assembly = generate(slug);
    const out = exportSat(assembly.pieces, results(assembly), { date });
    expect(out.errors.map((e) => e.message)).toEqual([]);
    const v = validateSat(out.data as string);
    expect(v.errors).toEqual([]);
    expect(v.counts.body).toBe(assembly.pieces.length);
    expect(v.bodies.map((b) => b.name)).toEqual(assembly.pieces.map((p) => p.id));
    for (const h of assembly.hardware) expect(v.bodies.some((b) => b.name === h.id)).toBe(false);
    const arcs = assembly.pieces.filter((p) => p.curve).length;
    expect(v.counts["cone-surface"] ?? 0).toBe(2 * arcs);
  });

  it.each(SLUGS)("%s di default: SAT un file per pezzo, ogni file valido", (slug) => {
    const assembly = generate(slug);
    const out = exportSat(assembly.pieces, results(assembly), { date, fileMode: "un-file-per-pezzo" });
    expect(out.errors).toEqual([]);
    expect(out.files).toHaveLength(assembly.pieces.length);
    for (const f of out.files) {
      const v = validateSat(f.text);
      expect(v.errors, f.name).toEqual([]);
      expect(v.counts.body).toBe(1);
      expect(v.bodies[0].name).toBe(f.pieceIds[0]);
    }
  });

  it.each(SLUGS)("%s di default: distinta con tabella pezzi e tabella ferramenta", (slug) => {
    const assembly = generate(slug);
    const { rows, hardwareRows, csv } = buildDistinta(assembly);
    expect(rows.reduce((n, r) => n + r.quantity, 0)).toBe(assembly.pieces.length);
    expect(hardwareRows.reduce((n, r) => n + r.quantity, 0)).toBe(assembly.hardware.reduce((n, h) => n + h.quantity, 0));
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines[rows.length + 1]).toBe("");
    expect(lines[rows.length + 2]).toBe(HARDWARE_COLUMNS.join(";"));
    expect(lines).toHaveLength(rows.length + 3 + hardwareRows.length);
    if (assembly.hardware.length > 0) expect(hardwareRows.length).toBeGreaterThan(0);
  });

  it("assieme con 20 pezzi e 15 voci di ferramenta → 20 body", () => {
    const full = generate("portale-sandwich");
    expect(full.pieces.length).toBeGreaterThanOrEqual(20);
    expect(full.hardware.length).toBeGreaterThanOrEqual(15);
    const assembly = { ...full, pieces: full.pieces.slice(0, 20), hardware: full.hardware.slice(0, 15) };
    const out = exportSat(assembly.pieces, results(assembly), { date });
    expect(out.errors).toEqual([]);
    expect(validateSat(out.data as string).counts.body).toBe(20);
  });
});
