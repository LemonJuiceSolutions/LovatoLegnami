import { beforeAll, describe, expect, it } from "vitest";
import { generate } from "@/domain";
import type { Assembly } from "@/domain/components/types";
import { plane } from "@/domain/math/plane";
import { vec3 } from "@/domain/math/vec3";
import { brepCounts, checkBrepTopology } from "./neutral-brep";
import { buildPieceSolid, isValidShape } from "./occt/build-piece";
import { extractBrep } from "./occt/extract-brep";
import { initOcct } from "./occt/init";
import { nodeOcctFactory } from "./occt/init-node";

/**
 * Fuorisquadra (sito-preventivi, gruppo 5): le tipologie a muro generate con il
 * muro reale (tagli di testa composti, banchina inclinata, travi di gronda della
 * pergola a L tagliate sull'altro muro) danno solidi OCCT validi con B-rep neutra
 * su sole facce piane/cilindriche.
 */

beforeAll(async () => {
  await initOcct({ factory: nodeOcctFactory });
});

const rad = (d: number) => (d * Math.PI) / 180;
const back5 = plane(vec3(0, 0, 0), vec3(Math.sin(rad(5)), -Math.cos(rad(5)), 0));

function problems(assembly: Assembly): string[] {
  const out: string[] = [];
  for (const p of assembly.pieces) {
    try {
      const solid = buildPieceSolid(p);
      const brep = extractBrep(solid);
      const c = brepCounts(brep);
      if (!isValidShape(solid)) out.push(`${p.id}: solido non valido`);
      else if (c.faces.altro || c.edges.altro) out.push(`${p.id}: B-rep con altro`);
      else if (checkBrepTopology(brep).length) out.push(`${p.id}: ${checkBrepTopology(brep)[0]}`);
      solid.delete();
    } catch (e) {
      out.push(`${p.id}: ${(e as Error).message}`);
    }
  }
  return out;
}

describe("kernel: tipologie a muro con muro fuori squadra", () => {
  it.each([
    ["addossata-monofalda", {}, { wallPlane: back5 }],
    ["addossata-sandwich listoni", { attaccoMuro: "listoni-paralleli" }, { wallPlane: back5 }],
    ["addossata-sandwich banchina carpenteria", { attaccoMuro: "banchina", costruzione: "carpenteria" }, { wallPlane: back5 }],
    ["pensilina-sbalzo con saette", { saette: true }, { wallPlane: back5 }],
    ["a-elle carpenteria 88°", {}, { wallPlane2: plane(vec3(0, 0, 0), vec3(Math.cos(rad(2)), Math.sin(rad(2)), 0)) }],
    ["a-elle bullonata 92°", { costruzione: "bullonata" }, { wallPlane: plane(vec3(0, 0, 0), vec3(Math.sin(rad(-2)), -Math.cos(rad(-2)), 0)) }],
  ] as const)("%s: tutti i pezzi costruiti", (name, params, options) => {
    const slug = name.split(" ")[0];
    expect(problems(generate(slug, params, options))).toEqual([]);
  });
});
