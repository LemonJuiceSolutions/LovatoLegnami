import { describe, expect, it } from "vitest";
import { pieceAabb } from "../assembly/bounds";
import { generate } from "../typologies/registry";
import { checkCollisions } from "./collisions";
import { parseEnvelope } from "./types";

const a = generate("addossata-monofalda");
const yMuro = a.meta.yMuro as number;
const top = Math.max(...a.pieces.map((p) => pieceAabb(p).max.z));
const banchina = a.pieces.find((p) => p.type === "banchina")!;
const env = (height: number, obstacles: unknown[] = []) => parseEnvelope({ box: { width: 6000, depth: yMuro, height }, obstacles });

describe("checkCollisions", () => {
  it("assieme interno e senza ostacoli → elenco vuoto", () => {
    expect(checkCollisions(a, env(Math.ceil(top)))).toEqual([]);
  });

  it("travetto oltre l'altezza massima → collisione con \"ingombro\" e quota di sforamento", () => {
    const c = checkCollisions(a, env(3000));
    const tvt = c.filter((x) => x.pieceId.startsWith("TVT"));
    expect(tvt.length).toBeGreaterThan(0);
    expect(tvt.every((x) => x.obstacleId === "ingombro" && x.side === "soffitto")).toBe(true);
    expect(Math.max(...tvt.map((x) => x.depth))).toBeCloseTo(top - 3000, 6);
    expect(tvt[0].message).toMatch(/esce dall'ingombro sul lato soffitto/);
  });

  it("banchina che interseca la grondaia → collisione con l'id della grondaia", () => {
    const zTop = pieceAabb(banchina).max.z;
    const g = { id: "grondaia-1", type: "grondaia", side: "posteriore", elevation: zTop - 50, height: 120, projection: 150 };
    const c = checkCollisions(a, env(4000, [g]));
    const hit = c.find((x) => x.pieceId === banchina.id);
    expect(hit).toMatchObject({ obstacleId: "grondaia-1" });
    expect(hit!.depth).toBeCloseTo(50, 6);
    expect(c.every((x) => x.obstacleId === "grondaia-1")).toBe(true);
  });

  it("tolleranza: interferenze entro la tolleranza ammesse; ostacoli fuori ingombro ignorati", () => {
    const zTop = pieceAabb(banchina).max.z;
    const g = { id: "g", type: "grondaia", side: "posteriore", elevation: zTop - 2, height: 120, projection: 150 };
    expect(checkCollisions(a, env(4000, [g]), 5).filter((x) => x.pieceId === banchina.id)).toEqual([]);
    const fuori = { id: "f", type: "generico", side: "posteriore", elevation: 5000, height: 100 };
    expect(checkCollisions(a, env(4000, [fuori]))).toEqual([]);
  });

  it("i pilastri affondati sotto il pavimento non sono collisioni", () => {
    const b = generate("addossata-monofalda", {}, { embedment: 300 });
    expect(checkCollisions(b, env(4000))).toEqual([]);
  });
});
