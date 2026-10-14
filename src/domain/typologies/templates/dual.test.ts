import { describe, expect, it } from "vitest";
import { pieceObb } from "../../assembly/bounds";
import { planeOfHeadCut } from "../../components/head-cut";
import type { Assembly, Piece } from "../../components/types";
import { applyToPoint, axisOf } from "../../math/mat4";
import { obbVertices } from "../../math/obb";
import { plane, signedDistance } from "../../math/plane";
import { vec3 } from "../../math/vec3";
import { buildAssembly, type BuildStep, type TypologyTemplate } from "../template";
import {
  type Construction,
  type Placed,
  beamOnPosts,
  constructionOf,
  constructionParam,
  groundAnchor,
  headCutOnPlane,
  joistScrewFor,
  joistsOnBeams,
  numberParam,
  placeStep,
  wallAttachment,
} from "./shared";

const SP = { b: 90, h: 90 };
const PLANK = { b: 45, h: 120 };
const BEAM = { b: 120, h: 200 };
const JOIST = { b: 45, h: 90 };

/**
 * Template di prova: 2 portali lungo X (y = 0 e y = 3000) di 4000 su 2
 * pilastri, 5 travetti lungo Y; `drop` abbassa il secondo portale (travetti
 * inclinati), `saette` aggiunge le saette.
 */
const duale: TypologyTemplate = {
  slug: "duale-test",
  name: "Duale (test)",
  description: "Portali e travetti nei due modi costruttivi.",
  category: "autoportante",
  tags: ["test"],
  params: [
    constructionParam(),
    numberParam("drop", "Abbassamento del secondo portale", "mm", 0, 500, 0, 1),
    { kind: "boolean", name: "saette", label: "Saette", default: false },
  ],
  build(ctx) {
    const mode = constructionOf(ctx);
    const portals = [0, 3000].map((y, k) =>
      beamOnPosts(ctx, mode, {
        prefix: `portale-${k}`,
        start: { x: 0, y },
        dir: { x: 1, y: 0 },
        length: 4000,
        posts: [300, 3700],
        underside: 2400 - k * ctx.num("drop"),
        postSection: SP,
        plank: PLANK,
        beam: BEAM,
        braces: ctx.bool("saette") ? { section: { b: 90, h: 90 } } : undefined,
      }),
    );
    const steps: BuildStep[] = portals.flatMap((p) => p.steps);
    // piano per gli spigoli superiori a valle (verso +Y) delle due travi
    const a = portals[0].top.point;
    const b = portals[1].top.point;
    const half = portals[0].width / 2;
    const seat = plane(vec3(0, half, a.z), vec3(0, (a.z - b.z) / 3000, 1));
    const joists = joistsOnBeams(ctx, mode, {
      seat,
      supports: portals.flatMap((p) => p.beams),
      joists: [0, 1, 2, 3, 4].map((i) => ({ ref: `travetto-${i}`, section: JOIST, from: { x: 200 + i * 900, y: -300 }, to: { x: 200 + i * 900, y: 3300 } })),
    });
    steps.push(...joists.steps);
    for (const p of portals) for (const post of p.posts) steps.push(...groundAnchor(ctx, "bicchiere", post.ref, SP));
    return steps;
  },
};

const gen = (costruzione: Construction, extra: Record<string, number | boolean> = {}) => buildAssembly(duale, { costruzione, ...extra });
const ofType = (a: Assembly, type: Piece["type"]) => a.pieces.filter((p) => p.type === type);
const minZ = (p: Piece) => Math.min(...obbVertices(pieceObb(p)).map((v) => v.z));
const maxZ = (p: Piece) => Math.max(...obbVertices(pieceObb(p)).map((v) => v.z));
const origin = (p: Piece) => applyToPoint(p.pose, vec3(0, 0, 0));
const count = (a: Assembly, kind: string) => a.hardware.filter((h) => h.kind === kind).reduce((n, h) => n + h.quantity, 0);

describe("mattoni duali: stessa pianta e stessa quota d'intradosso", () => {
  it("pilastri nelle stesse posizioni, intradosso della trave a 2400 in entrambi i modi", () => {
    const [bul, car] = [gen("bullonata"), gen("carpenteria")];
    const plan = (a: Assembly) => ofType(a, "pilastro").map((p) => [origin(p).x, origin(p).y]);
    expect(plan(bul)).toEqual(plan(car));
    expect(plan(bul)).toEqual([
      [300, 0],
      [3700, 0],
      [300, 3000],
      [3700, 3000],
    ]);
    for (const b of ofType(bul, "tavola")) expect(minZ(b)).toBeCloseTo(2400, 6);
    for (const b of ofType(car, "trave")) expect(minZ(b)).toBeCloseTo(2400, 6);
  });

  it("bullonata: 2 tavole per portale, 2 bulloni per pilastro, nessun tenone o mortasa", () => {
    const a = gen("bullonata");
    expect(ofType(a, "tavola")).toHaveLength(4);
    expect(ofType(a, "trave")).toHaveLength(0);
    expect(a.hardware.filter((h) => h.kind === "bullone")).toHaveLength(8);
    for (const post of ofType(a, "pilastro")) {
      const bolts = a.hardware.filter((h) => h.kind === "bullone" && h.pieceIds.includes(post.id));
      expect(bolts).toHaveLength(2);
      expect(bolts.every((b) => b.code === "bullone-m12x200" && b.pieceIds.length === 3)).toBe(true);
      expect(maxZ(post)).toBeCloseTo(2520, 6); // testa a filo dell'estradosso delle tavole
    }
    expect(a.pieces.flatMap((p) => p.machinings).some((m) => m.type === "tenone" || m.type === "mortasa")).toBe(false);
    // tavole ai lati del pilastro: assi a ±(45 + 22,5)
    expect(ofType(a, "tavola").slice(0, 2).map((p) => origin(p).y)).toEqual([-67.5, 67.5]);
  });

  it("carpenteria: trave singola, tenone pilastro → trave, nessun bullone", () => {
    const a = gen("carpenteria");
    expect(ofType(a, "trave")).toHaveLength(2);
    expect(ofType(a, "tavola")).toHaveLength(0);
    expect(count(a, "bullone")).toBe(0);
    for (const post of ofType(a, "pilastro")) {
      expect(post.machinings.map((m) => m.type)).toContain("tenone");
      expect(maxZ(post)).toBeCloseTo(2400, 6);
    }
    expect(a.joints.filter((j) => j.type === "tenone-mortasa")).toHaveLength(4);
  });
});

describe("travetti sugli appoggi", () => {
  it("bullonata: travetti sull'estradosso, una vite per tavola toccata", () => {
    const a = gen("bullonata");
    const joists = ofType(a, "travetto");
    expect(joists).toHaveLength(5);
    for (const j of joists) expect(minZ(j)).toBeCloseTo(2520, 6);
    const screws = a.hardware.find((h) => h.code === joistScrewFor(JOIST))!;
    expect(screws.code).toBe("vite-6x160");
    expect(screws.quantity).toBe(5 * 2 * 2);
    expect(joists.every((j) => j.machinings.length === 0)).toBe(true);
  });

  it("carpenteria orizzontale: mezzo legno trave–travetto con assi alla stessa quota", () => {
    const a = gen("carpenteria");
    expect(a.joints.filter((j) => j.type === "mezzo-legno")).toHaveLength(10);
    const j = ofType(a, "travetto")[0];
    expect(origin(j).z).toBeCloseTo(2500, 6); // asse della trave 120×200 con intradosso 2400
    expect(j.machinings.filter((m) => m.type === "mezzo-legno").every((m) => m.face === "inferiore" && m.depth === 45)).toBe(true);
    expect(count(a, "vite")).toBe(4 * 4); // solo le viti dei bicchieri
  });

  it("carpenteria inclinata: becco d'uccello sullo spigolo a valle di ogni trave", () => {
    const a = gen("carpenteria", { drop: 200 });
    const j = ofType(a, "travetto")[0];
    const becchi = j.machinings.filter((m) => m.type === "becco-uccello");
    expect(becchi).toHaveLength(2);
    const slope = (Math.atan(200 / 3000) * 180) / Math.PI;
    for (const m of becchi) if (m.type === "becco-uccello") expect(m.angle).toBeCloseTo(slope, 6);
    expect(axisOf(j.pose, 0).z).toBeLessThan(0.1);
    expect(a.joints.filter((jt) => jt.type === "mezzo-legno")).toHaveLength(0);
  });

  it("bullonata inclinata: travetti appoggiati sugli spigoli, nessuna lavorazione", () => {
    const a = gen("bullonata", { drop: 200 });
    expect(ofType(a, "travetto").every((j) => j.machinings.length === 0)).toBe(true);
    expect(a.hardware.find((h) => h.code === "vite-6x160")!.quantity).toBe(20);
  });
});

describe("saette", () => {
  it("bullonata: saette da 750 tra le tavole con bullone in testa e 2 viti al piede", () => {
    const a = gen("bullonata", { saette: true });
    const braces = ofType(a, "controvento");
    expect(braces).toHaveLength(4); // solo verso l'interno: all'esterno 255 mm di sbalzo non bastano
    for (const b of braces) {
      expect(b.length).toBeCloseTo(750, 6);
      expect(maxZ(b)).toBeLessThanOrEqual(2520 + 45 * Math.SQRT2 + 1e-6); // box prima del taglio
      const cuts = b.machinings.filter((m) => m.type === "taglio-testa");
      expect(cuts.map((m) => Math.abs((m as { angle: number }).angle))).toEqual([45, 45]);
      // il taglio di testa giace sull'estradosso delle tavole
      const head = cuts.find((m) => m.face === "testa-fine")!;
      const pl = planeOfHeadCut(b, head as never);
      expect(signedDistance(pl, vec3(0, 0, 2520))).toBeCloseTo(0, 6);
    }
    expect(a.hardware.filter((h) => h.kind === "bullone")).toHaveLength(8 + 4);
    expect(a.hardware.find((h) => h.code === "vite-6x160")!.quantity).toBe(20 + 8);
  });

  it("carpenteria: saette a 45° fino all'intradosso, nessun bullone", () => {
    const a = gen("carpenteria", { saette: true });
    expect(ofType(a, "controvento")).toHaveLength(4);
    expect(count(a, "bullone")).toBe(0);
    for (const b of ofType(a, "controvento")) {
      const head = b.machinings.find((m) => m.type === "taglio-testa" && m.face === "testa-fine")!;
      expect(signedDistance(planeOfHeadCut(b, head as never), vec3(0, 0, 2400))).toBeCloseTo(0, 6);
    }
  });
});

describe("ancoraggi, attacchi a muro e taglio sul piano", () => {
  const single = (steps: (ctx: Parameters<TypologyTemplate["build"]>[0]) => BuildStep[]): Assembly =>
    buildAssembly({ ...duale, slug: "mattoni-test", params: [constructionParam()], build: steps });

  it("bicchiere: 1 staffa per pilastro con 4 viti 8×40", () => {
    const a = gen("bullonata");
    expect(a.hardware.filter((h) => h.kind === "staffa-terra")).toHaveLength(4);
    expect(a.hardware.find((h) => h.code === "vite-8x40")!.quantity).toBe(16);
  });

  it("listoni paralleli: teste a filo muro, staffa e bullone tavola–lama–tavola", () => {
    const wall = plane(vec3(0, 2000, 0), vec3(0, -1, 0));
    const a = single((ctx) => {
      const p = beamOnPosts(ctx, "bullonata", {
        prefix: "telaio",
        start: { x: 0, y: -300 },
        dir: { x: 0, y: 1 },
        length: 2400,
        posts: [300],
        underside: 2400,
        slope: 10,
        postSection: SP,
        plank: PLANK,
        beam: BEAM,
      });
      return [...p.steps, ...wallAttachment(ctx, "listoni-paralleli", { beams: p.beams, face: "testa-fine", wall })];
    });
    expect(a.hardware.filter((h) => h.kind === "staffa-muro").map((h) => h.code)).toEqual(["staffa-muro-listoni-paralleli-90"]);
    expect(a.hardware.filter((h) => h.kind === "bullone")).toHaveLength(3);
    for (const t of ofType(a, "tavola")) {
      const cut = t.machinings.find((m) => m.type === "taglio-testa")!;
      expect(Math.abs((cut as { angle: number }).angle)).toBeCloseTo(10, 6);
      const pl = planeOfHeadCut(t, cut as never);
      expect(Math.abs(pl.normal.y)).toBeCloseTo(1, 6);
      expect(signedDistance(wall, pl.point)).toBeCloseTo(0, 6);
    }
  });

  it("scomparsa su trave singola: asola e 2 fori; su trave doppia → errore", () => {
    const wall = plane(vec3(0, 0, 0), vec3(0, 1, 0));
    const beam: Placed = { ref: "mensola", type: "mensola", section: { b: 90, h: 140 }, length: 1200, pose: [0, 1, 0, 0, -1, 0, 0, 1200, 0, 0, 1, 2400, 0, 0, 0, 1] };
    const a = single((ctx) => [placeStep(beam), ...wallAttachment(ctx, "scomparsa-17", { beams: [beam], face: "testa-fine", wall })]);
    expect(a.pieces[0].machinings.map((m) => m.type)).toEqual(["taglio-testa", "asola-lama", "foro", "foro"]);
    expect(() => single((ctx) => wallAttachment(ctx, "scomparsa-17", { beams: [beam, beam], face: "testa-fine", wall }))).toThrow(/trave singola/);
  });

  it("headCutOnPlane: taglio calcolato dal pezzo posizionato", () => {
    const beam: Placed = { ref: "t", type: "trave", section: BEAM, length: 3000, pose: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 2500, 0, 0, 0, 1] };
    const pl = plane(vec3(2800, 0, 0), vec3(Math.cos(0.3), Math.sin(0.3), 0));
    const a = single(() => [placeStep(beam), headCutOnPlane("t", pl, "testa-fine")]);
    const cut = a.pieces[0].machinings[0];
    expect(cut.type).toBe("taglio-testa");
    expect(signedDistance(pl, planeOfHeadCut(a.pieces[0], cut as never).point)).toBeCloseTo(0, 6);
  });
});
