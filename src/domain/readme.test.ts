import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

/** Primo blocco ```ts del README del dominio. */
function readmeExample(): string {
  const md = readFileSync(join(here, "README.md"), "utf8");
  const m = /```ts\n([\s\S]*?)```/.exec(md);
  if (!m) throw new Error("nessun esempio ts nel README");
  return m[1];
}

describe("README del dominio", () => {
  it("l'esempio di codice compila con il tsconfig del progetto", () => {
    const config = ts.getParsedCommandLineOfConfigFile(join(root, "tsconfig.json"), {}, {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => {
        throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
      },
    })!;
    const file = join(here, "__readme_example__.ts");
    const source = readmeExample();
    const options: ts.CompilerOptions = { ...config.options, noEmit: true, incremental: false, plugins: [] };
    const host = ts.createCompilerHost(options);
    const getSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (name, lang, ...rest) =>
      resolve(name) === file ? ts.createSourceFile(name, source, lang, true) : getSourceFile(name, lang, ...rest);
    const fileExists = host.fileExists.bind(host);
    host.fileExists = (name) => resolve(name) === file || fileExists(name);
    const program = ts.createProgram([file], options, host);
    const diagnostics = ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
    expect(diagnostics).toEqual([]);
  }, 30000);

  it("l'esempio funziona a runtime", async () => {
    const d = await import("./index");
    const envelope = d.parseEnvelope({ box: { width: 6000, depth: 3500, height: 3200 } });
    const a = d.generate(d.listTypologies()[0].slug, { larghezza: 5000, pendenza: 12 }, { floorHeightAt: d.floorFunction(envelope) });
    expect(d.evaluateRules(a, d.DEFAULT_LOVATO_RULES).valid).toBe(true);
  });
});
