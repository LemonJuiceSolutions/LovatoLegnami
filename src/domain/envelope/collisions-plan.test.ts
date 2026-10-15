import { describe, expect, it } from "vitest";
import { assemblyBounds } from "../assembly/bounds";
import { DEFAULT_LOVATO_RULES } from "../rules/data/default-lovato";
import { obbVertices } from "../math/obb";
import { signedDistance } from "../math/plane";
import { generate, listTypologies } from "../typologies/registry";
import { checkCollisions } from "./collisions";
import { fitToEnvelope } from "./fit";
import { rectanglePlan, wallPlane } from "./plan";
import { type Envelope, absoluteObstacles, parseEnvelope } from "./types";

const rad = (d: number) => (d * Math.PI) / 180;
const a = generate("addossata-monofalda");
const yMuro = a.meta.yMuro as number;
const W = 6000;
const rise = W * Math.tan(rad(5));

/** Muro posteriore inclinato di 5° che passa per (0, y0) e si allontana verso destra. */
const skewedEnvelope = (y0: number, obstacles: unknown[] = []): Envelope =>
  parseEnvelope({
    box: { width: W, depth: y0 + rise, height: 4000 },
    plan: { corners: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: y0 + rise }, { x: 0, y: y0 }] },
    obstacles,
  });

describe("collisioni con la pianta fuori squadra", () => {
  it("grondaia sul muro inclinato: il volume segue il lato e sporge verso l'interno", () => {
    const e = skewedEnvelope(yMuro, [{ id: "g", type: "grondaia", side: "posteriore", elevation: 3000, height: 120, projection: 150 }]);
    const [g] = absoluteObstacles(e);
    const wall = wallPlane(e);
    const vs = obbVertices(g.box);
    const ds = vs.map((v) => signedDistance(wall, v));
    expect(Math.min(...ds)).toBeCloseTo(0, 9);
    expect(Math.max(...ds)).toBeCloseTo(150, 9);
    // per tutta la larghezza: dagli angoli posteriori della pianta
    expect(Math.min(...vs.map((v) => v.x))).toBeCloseTo(0, 6);
    expect(g.aabb.max.x).toBeCloseTo(W + 150 * Math.sin(rad(5)), 6);
    expect(g.box.axes[0].y).toBeCloseTo(Math.sin(rad(5)), 12);
    expect(g.ignored).toBe(false);
  });

  it("travetto oltre il muro inclinato → collisione `ingombro` sul lato posteriore", () => {
    const c = checkCollisions(a, skewedEnvelope(yMuro - 100));
    expect(c.length).toBeGreaterThan(0);
    expect(c.every((x) => x.obstacleId === "ingombro" && x.side === "posteriore")).toBe(true);
    // banchina: ~100 mm sulla normale del muro all'estremo sinistro; il primo travetto sfora, l'ultimo no
    expect(c.find((x) => x.pieceId.startsWith("BNC"))!.depth).toBeCloseTo(100 * Math.cos(rad(5)), 6);
    expect(c.some((x) => x.pieceId === "TVT-01" && x.depth > 50)).toBe(true);
    expect(c.some((x) => x.pieceId === a.pieces.filter((p) => p.type === "travetto").at(-1)!.id)).toBe(false);
    // con il muro inclinato che parte dalla banchina nulla sfora
    expect(checkCollisions(a, skewedEnvelope(yMuro))).toEqual([]);
  });

  it("pianta rettangolare dichiarata ⇒ stesse collisioni e stesso adattamento del box", () => {
    for (const t of listTypologies()) {
      const asm = generate(t.slug);
      const b = assemblyBounds(asm)!;
      const box = { width: Math.ceil(b.max.x) - 200, depth: Math.ceil(b.max.y) - 100, height: Math.ceil(b.max.z) - 100 };
      const obstacles = [
        { id: "g", type: "grondaia", side: "posteriore", elevation: box.height - 300, height: 120, projection: 150 },
        { id: "f", type: "finestra", side: "sinistro", offset: 300, width: 800, elevation: 900, height: 1200 },
      ];
      const plain = parseEnvelope({ box, obstacles });
      const planned = parseEnvelope({ box, obstacles, plan: rectanglePlan(box) });
      expect(checkCollisions(asm, planned)).toEqual(checkCollisions(asm, plain));
    }
    const box = { width: 5000, depth: 3300, height: 3200 };
    const plain = parseEnvelope({ box });
    const planned = parseEnvelope({ box, plan: rectanglePlan(box) });
    expect(fitToEnvelope("addossata-monofalda", planned, {}, DEFAULT_LOVATO_RULES)).toEqual(fitToEnvelope("addossata-monofalda", plain, {}, DEFAULT_LOVATO_RULES));
  });

  it("ostacolo sul lato inclinato interamente sopra l'ingombro → ignorato", () => {
    const e = skewedEnvelope(yMuro, [{ id: "alto", type: "sporgenza", side: "posteriore", elevation: 4200, height: 100 }]);
    expect(absoluteObstacles(e)[0]).toMatchObject({ ignored: true });
  });
});
