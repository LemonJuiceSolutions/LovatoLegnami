import { z } from "zod";
import { DEFAULT_NAME_ATTRIBUTE, DEFAULT_SAT_PRODUCER } from "./writer";
import { DEFAULT_SAT_VERSION, SAT_VERSIONS } from "./versions";

/**
 * Opzioni dell'export SAT (spec `export-cnc`, "Opzioni SAT configurabili"),
 * persistite con la configurazione (`config.exportOptions.sat`).
 */

export const SAT_FILE_MODES = ["assieme-unico", "un-file-per-pezzo"] as const;
export type SatFileMode = (typeof SAT_FILE_MODES)[number];

export const SatExportOptionsSchema = z.object({
  /** Versione del formato (default 7.0). */
  version: z.enum(SAT_VERSIONS).default(DEFAULT_SAT_VERSION),
  /** Un file con tutti i body oppure uno ZIP con un `<id>.sat` per pezzo. */
  fileMode: z.enum(SAT_FILE_MODES).default("assieme-unico"),
  /** Unità: fissa a mm nell'MVP, dichiarata nell'header (riga 3). */
  units: z.literal("mm").default("mm"),
  /** Attributo nome = id del pezzo su ogni body. */
  includeName: z.boolean().default(true),
  /** Campo libero "produttore/CAM" scritto come product id nell'header. */
  producer: z.string().max(200).default(DEFAULT_SAT_PRODUCER),
  /** Nome dell'attributo stringa del nome body (avanzata, da adeguare al SAT campione). */
  nameAttribute: z.string().trim().min(1).max(64).default(DEFAULT_NAME_ATTRIBUTE),
});

export type SatExportOptions = z.infer<typeof SatExportOptionsSchema>;
export type SatExportOptionsInput = z.input<typeof SatExportOptionsSchema>;

export const DEFAULT_SAT_OPTIONS: SatExportOptions = SatExportOptionsSchema.parse({});
