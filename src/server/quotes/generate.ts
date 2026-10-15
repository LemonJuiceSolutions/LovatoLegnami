import { floorFunction, generate, getTypology, wallBuildOptions, type Assembly, type Envelope, type ParamValue } from "@/domain";

/** Configurazione minima per rigenerare l'assieme sul server (sottoinsieme di `ConfiguratoreConfig`). */
export interface AssemblyConfig {
  readonly typology: string;
  readonly params: Readonly<Record<string, ParamValue>>;
  readonly envelope: Envelope;
  readonly embedment: number;
}

/**
 * Assieme dalla configurazione come nel configuratore (`computeDerived`): pavimento reale,
 * affondamento e muri reali della pianta (`wallBuildOptions`). Il server **non** si fida
 * dell'assieme del client: lo rigenera sempre da qui.
 */
export function assemblyFromConfig(config: AssemblyConfig): Assembly {
  const template = getTypology(config.typology);
  return generate(config.typology, config.params, {
    floorHeightAt: floorFunction(config.envelope),
    embedment: config.embedment,
    ...wallBuildOptions(template, config.envelope),
  });
}
