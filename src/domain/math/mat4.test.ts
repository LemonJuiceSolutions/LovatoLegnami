import { describe, expect, it } from "vitest";
import {
  applyToPoint,
  applyToVector,
  equalsMat4,
  fromBasis,
  identity,
  invertRigid,
  multiply,
  rotationX,
  rotationY,
  rotationZ,
  translation,
} from "./mat4";
import { equals, vec3 } from "./vec3";

const HALF_PI = Math.PI / 2;

describe("mat4", () => {
  it("identità lascia invariati i punti", () => {
    expect(applyToPoint(identity(), vec3(1, 2, 3))).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("traslazione sposta i punti ma non i vettori", () => {
    const t = translation(vec3(10, 20, 30));
    expect(applyToPoint(t, vec3(1, 2, 3))).toEqual({ x: 11, y: 22, z: 33 });
    expect(applyToVector(t, vec3(1, 2, 3))).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("rotazione 90° attorno a Z porta (1,0,0) in (0,1,0)", () => {
    expect(equals(applyToPoint(rotationZ(HALF_PI), vec3(1, 0, 0)), vec3(0, 1, 0))).toBe(true);
  });

  it("rotazioni 90° attorno a X e Y (regola della mano destra)", () => {
    expect(equals(applyToVector(rotationX(HALF_PI), vec3(0, 1, 0)), vec3(0, 0, 1))).toBe(true);
    expect(equals(applyToVector(rotationY(HALF_PI), vec3(0, 0, 1)), vec3(1, 0, 0))).toBe(true);
  });

  it("moltiplicazione compone: prima b poi a", () => {
    const m = multiply(translation(vec3(5, 0, 0)), rotationZ(HALF_PI));
    expect(equals(applyToPoint(m, vec3(1, 0, 0)), vec3(5, 1, 0))).toBe(true);
    expect(equalsMat4(multiply(identity(), m), m)).toBe(true);
  });

  it("inversa di trasformazione rigida: inversa·M = I", () => {
    const m = multiply(
      translation(vec3(1200, -300, 2400)),
      multiply(rotationZ(0.7), multiply(rotationX(-0.3), rotationY(1.1))),
    );
    expect(equalsMat4(multiply(invertRigid(m), m), identity())).toBe(true);
    expect(equalsMat4(multiply(m, invertRigid(m)), identity())).toBe(true);
  });

  it("fromBasis costruisce la posa da origine e assi", () => {
    const m = fromBasis(vec3(100, 0, 0), vec3(0, 1, 0), vec3(0, 0, 1));
    // X locale → Y assieme, Y locale = Z × X = (-1,0,0)
    expect(equals(applyToPoint(m, vec3(10, 0, 0)), vec3(100, 10, 0))).toBe(true);
    expect(equals(applyToPoint(m, vec3(0, 10, 0)), vec3(90, 0, 0))).toBe(true);
  });
});
