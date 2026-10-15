import { PRESET_CATALOG, type Preset } from "@/domain";
import { presetConfig, type ConfiguratoreConfig } from "./config";
import { parseConfigFile, type ConfigFile } from "./config-file";

/**
 * Configurazioni di esempio caricabili con un clic (spec `configuratore-ui`,
 * "Esempi precaricati" e "Selettore dei preset commerciali"). Sono i preset
 * commerciali del dominio (`PRESET_CATALOG`), con gli esempi MVP ("Monofalda
 * con grondaia", "Bifalda libera") per primi, espressi come file di
 * configurazione come quelli salvati dall'utente: passano da `parseConfigFile`.
 */

export interface ConfiguratoreExample {
  /** Id del preset (es. `maxi-5x5`). */
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly typologySlug: string;
  /** Fonte del preset (scheda di `ricerca-chepergola.md`). */
  readonly source: string;
  /** Note del preset (deduzioni con `[dedotto]`). */
  readonly notes: readonly string[];
  /** File di configurazione (calcolato al primo accesso: l'ingombro di default richiede una generazione). */
  readonly file: ConfigFile;
}

/** Esempi MVP mostrati per primi (ordine storico del menu). */
const FIRST = ["monofalda-grondaia", "bifalda-libera"];

function toExample(preset: Preset): ConfiguratoreExample {
  let file: ConfigFile | undefined;
  return {
    id: preset.id,
    name: preset.name,
    description: preset.notes[0] ?? preset.source,
    typologySlug: preset.typologySlug,
    source: preset.source,
    notes: preset.notes,
    get file(): ConfigFile {
      if (!file) {
        // l'ingombro (dichiarato o allargato fino a contenere l'assieme) è quello di `presetConfig`
        const { envelope } = presetConfig(preset.id);
        file = {
          schemaVersion: 1,
          typology: preset.typologySlug,
          params: { ...preset.params },
          envelope: JSON.parse(JSON.stringify(envelope)) as ConfigFile["envelope"],
          embedment: 0,
        };
      }
      return file;
    },
  };
}

export const EXAMPLES: readonly ConfiguratoreExample[] = [
  ...FIRST.map((id) => PRESET_CATALOG.find((p) => p.id === id)!),
  ...PRESET_CATALOG.filter((p) => !FIRST.includes(p.id)),
].map(toExample);

/** Configurazione dell'esempio (lancia se l'id non esiste). */
export function exampleConfig(id: string): ConfiguratoreConfig {
  const example = EXAMPLES.find((e) => e.id === id);
  if (!example) throw new Error(`esempio non trovato: ${id}`);
  return parseConfigFile(example.file);
}
