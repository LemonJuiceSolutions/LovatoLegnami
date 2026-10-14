import type { ConfiguratoreConfig } from "./config";
import { parseConfigFile, type ConfigFile } from "./config-file";

/**
 * Configurazioni di esempio caricabili con un clic (spec `configuratore-ui`,
 * "Esempi precaricati"). Sono file di configurazione come quelli salvati
 * dall'utente e passano da `parseConfigFile`.
 */

export interface ConfiguratoreExample {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly file: ConfigFile;
}

export const EXAMPLES: readonly ConfiguratoreExample[] = [
  {
    id: "monofalda-grondaia",
    name: "Monofalda con grondaia",
    description:
      "Addossata 5 × 3 m al muro di casa, pendenza 10°, sotto la grondaia esistente; pavimento in pendenza di 8 cm verso il fronte.",
    file: {
      schemaVersion: 1,
      typology: "addossata-monofalda",
      params: { larghezza: 5000, profondita: 3000, altezza: 2400, pendenza: 10 },
      envelope: {
        box: { width: 5000, depth: 3600, height: 3600 },
        wallSide: "posteriore",
        obstacles: [
          {
            id: "OST-01",
            type: "grondaia",
            label: "Grondaia di casa",
            side: "posteriore",
            elevation: 3350,
            height: 150,
            projection: 150,
          },
        ],
        floor: { corners: { frontLeft: -80, frontRight: -80, backLeft: 0, backRight: 0 } },
      },
      embedment: 0,
    },
  },
  {
    id: "bifalda-libera",
    name: "Bifalda libera",
    description: "Autoportante bifalda 5 × 4 m con i parametri di default, in giardino senza ostacoli su pavimento piano.",
    file: {
      schemaVersion: 1,
      typology: "autoportante-bifalda",
      params: {},
      envelope: { box: { width: 5000, depth: 5100, height: 3600 } },
      embedment: 0,
    },
  },
];

/** Configurazione dell'esempio (lancia se l'id non esiste). */
export function exampleConfig(id: string): ConfiguratoreConfig {
  const example = EXAMPLES.find((e) => e.id === id);
  if (!example) throw new Error(`esempio non trovato: ${id}`);
  return parseConfigFile(example.file);
}
