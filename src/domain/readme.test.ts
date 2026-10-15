import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

/** Blocchi ```ts del README del dominio (flusso tipico, preventivazione, …). */
function readmeExamples(): string[] {
  const md = readFileSync(join(here, "README.md"), "utf8");
  const blocks = [...md.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]);
  if (blocks.length === 0) throw new Error("nessun esempio ts nel README");
  return blocks;
}

describe("README del dominio", () => {
  it("ci sono gli esempi del flusso tipico e della preventivazione", () => {
    const blocks = readmeExamples();
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(blocks.some((b) => b.includes("priceAssembly"))).toBe(true);
  });

  it("gli esempi di codice compilano con il tsconfig del progetto", () => {
    const config = ts.getParsedCommandLineOfConfigFile(join(root, "tsconfig.json"), {}, {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => {
        throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
      },
    })!;
    const sources = new Map(readmeExamples().map((src, i) => [join(here, `__readme_example_${i}__.ts`), src]));
    const options: ts.CompilerOptions = { ...config.options, noEmit: true, incremental: false, plugins: [] };
    const host = ts.createCompilerHost(options);
    const getSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (name, lang, ...rest) =>
      sources.has(resolve(name)) ? ts.createSourceFile(name, sources.get(resolve(name))!, lang, true) : getSourceFile(name, lang, ...rest);
    const fileExists = host.fileExists.bind(host);
    host.fileExists = (name) => sources.has(resolve(name)) || fileExists(name);
    const program = ts.createProgram([...sources.keys()], options, host);
    const diagnostics = ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
    expect(diagnostics).toEqual([]);
  }, 30000);

  it("l'esempio funziona a runtime", async () => {
    const d = await import("./index");
    const envelope = d.parseEnvelope({ box: { width: 6000, depth: 3500, height: 3200 } });
    const a = d.generate(d.listTypologies()[0].slug, { larghezza: 5000, pendenza: 12 }, { floorHeightAt: d.floorFunction(envelope) });
    expect(d.evaluateRules(a, d.DEFAULT_LOVATO_RULES).valid).toBe(true);
  });

  it("l'esempio della preventivazione funziona a runtime", async () => {
    const d = await import("./index");
    const quote = d.priceAssembly({
      assembly: d.generate("addossata-monofalda"),
      envelope: d.parseEnvelope({ box: { width: 6000, depth: 3600, height: 3800 } }),
      options: { species: "abete", quality: "lamellare", treatment: "impregnante-incolore", covering: "policarbonato-alveolare", cap: "36100", access: "medio" },
      priceList: d.DEFAULT_PRICE_LIST,
      version: d.DEFAULT_PRICE_LIST_VERSION,
    });
    expect(quote.status).toBe("completo");
    expect(d.customerView(quote).totalCents).toBe(quote.totals.totalCents);
    expect(d.officeView(quote).firedRules.map((r) => r.id)).toContain("accesso");
  });
});
