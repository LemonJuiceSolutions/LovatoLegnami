import { makeBox } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { multiply, rotationZ, translation } from "@/domain/math/mat4";
import { vec3 } from "@/domain/math/vec3";
import { initOcct } from "./init";
import { nodeOcctFactory } from "./init-node";
import { placeShape } from "./pose";

beforeAll(async () => {
  await initOcct({ factory: nodeOcctFactory });
});

describe("placeShape", () => {
  it("applica rotazione e traslazione della posa a una copia del solido", () => {
    const box = makeBox([0, -50, -50], [1000, 50, 50]);
    const pose = multiply(translation(vec3(200, 300, 400)), rotationZ(Math.PI / 2));
    const placed = placeShape(box, pose);
    const [min, max] = placed.boundingBox.bounds;
    expect(min[0]).toBeCloseTo(150, 3);
    expect(max[0]).toBeCloseTo(250, 3);
    expect(min[1]).toBeCloseTo(300, 3);
    expect(max[1]).toBeCloseTo(1300, 3);
    expect(min[2]).toBeCloseTo(350, 3);
    // l'originale non cambia
    expect(box.boundingBox.bounds[1][0]).toBeCloseTo(1000, 3);
    placed.delete();
    box.delete();
  });

  it("rifiuta pose non rigide", () => {
    const box = makeBox([0, 0, 0], [1, 1, 1]);
    const scaled = [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    expect(() => placeShape(box, scaled)).toThrow(/non rigida/);
    box.delete();
  });
});
