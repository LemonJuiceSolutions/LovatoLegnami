import { z } from "zod";
import {
  EnvelopeSchema,
  TypologyNotFoundError,
  ValidationError,
  defaultParams,
  getTypology,
  issuesFromZod,
  type Envelope,
  type TypologyTemplate,
  type ValidationIssue,
} from "@/domain";
import { SatExportOptionsSchema } from "@/export/sat/options";
import { CONFIG_SCHEMA_VERSION, paramErrorsOf, type ConfiguratoreConfig } from "./config";

/**
 * File JSON della configurazione (spec `configuratore-ui`, "Stato e
 * persistenza"): `serializeConfig` / `parseConfigFile`, usati anche per lo
 * storage locale (`persist`). Il file è versionato con `schemaVersion`;
 * versioni precedenti passano dalle funzioni di `MIGRATIONS`, versioni non
 * supportate sono rifiutate.
 */

/** Versioni accettate in lettura (le precedenti alla corrente richiedono una migrazione). */
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [CONFIG_SCHEMA_VERSION];

/** Migrazioni `n → n+1` sui dati grezzi (nessuna finché lo schema è alla versione 1). */
const MIGRATIONS: Readonly<Record<number, (data: Record<string, unknown>) => Record<string, unknown>>> = {};

export const ConfigFileSchema = z
  .object({
    schemaVersion: z.literal(CONFIG_SCHEMA_VERSION),
    typology: z.string().min(1, "tipologia obbligatoria"),
    params: z.record(z.union([z.number().finite(), z.string(), z.boolean()])).default({}),
    envelope: EnvelopeSchema,
    embedment: z.number().finite().nonnegative("deve essere maggiore o uguale a 0").default(0),
    exportOptions: z.object({ sat: SatExportOptionsSchema.default({}) }).strict().default({}),
  })
  .strict();

export type ConfigFile = z.input<typeof ConfigFileSchema>;

/** File di configurazione non valido: `issues` con i percorsi dei campi (es. `envelope.box.height`). */
export class ConfigFileError extends ValidationError {
  constructor(issues: readonly ValidationIssue[]) {
    super("configurazione non valida", issues);
    this.name = "ConfigFileError";
  }
}

/** JSON della configurazione (indentazione 2, newline finale). */
export function serializeConfig(config: ConfiguratoreConfig): string {
  const file: ConfiguratoreConfig = {
    schemaVersion: config.schemaVersion,
    typology: config.typology,
    params: config.params,
    envelope: config.envelope,
    embedment: config.embedment,
    exportOptions: config.exportOptions,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

const fail = (path: string, message: string): never => {
  throw new ConfigFileError([{ path, message }]);
};

function migrate(data: Record<string, unknown>): Record<string, unknown> {
  const version = data.schemaVersion;
  if (version === undefined) fail("schemaVersion", "obbligatorio");
  if (typeof version !== "number" || !Number.isInteger(version)) fail("schemaVersion", "deve essere un intero");
  let v = version as number;
  if (v > CONFIG_SCHEMA_VERSION || (v < CONFIG_SCHEMA_VERSION && !MIGRATIONS[v]))
    fail("schemaVersion", `versione ${v} non supportata (supportate: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")})`);
  let out = data;
  while (v < CONFIG_SCHEMA_VERSION) {
    out = MIGRATIONS[v](out);
    v++;
  }
  return out;
}

/**
 * Legge una configurazione da testo JSON (o da un oggetto già decodificato):
 * versione, struttura, tipologia esistente e parametri ammessi dal template
 * (i mancanti prendono il default). Lancia `ConfigFileError` con il dettaglio.
 */
export interface ParseConfigOptions {
  /**
   * Mantiene i parametri noti con valori fuori limite o di tipo errato (e
   * scarta quelli sconosciuti) invece di rifiutare il file: serve al ripristino
   * da `localStorage`, dove lo stato salvato può contenere un valore appena
   * digitato e segnalato inline. `computeDerived` li evidenzia come sempre.
   */
  readonly keepInvalidParams?: boolean;
}

export function parseConfigFile(input: string | unknown, options: ParseConfigOptions = {}): ConfiguratoreConfig {
  let data: unknown = input;
  if (typeof input === "string") {
    try {
      data = JSON.parse(input);
    } catch (e) {
      fail("(radice)", `JSON non valido: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) fail("(radice)", "deve essere un oggetto JSON");
  const parsed = ConfigFileSchema.safeParse(migrate(data as Record<string, unknown>));
  if (!parsed.success) throw new ConfigFileError(issuesFromZod(parsed.error));
  const file = parsed.data;

  let template: TypologyTemplate;
  try {
    template = getTypology(file.typology);
  } catch (e) {
    return fail("typology", e instanceof TypologyNotFoundError ? e.message : String(e));
  }
  let params = file.params;
  if (options.keepInvalidParams) {
    const known = new Set(template.params.map((p) => p.name));
    params = Object.fromEntries(Object.entries(params).filter(([name]) => known.has(name)));
  } else {
    const errors = paramErrorsOf(template, params);
    const issues = Object.entries(errors).map(([name, message]) => ({ path: `params.${name}`, message }));
    if (issues.length > 0) throw new ConfigFileError(issues);
  }

  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    typology: file.typology,
    params: { ...defaultParams(template), ...params },
    envelope: file.envelope as Envelope,
    embedment: file.embedment,
    exportOptions: file.exportOptions,
  };
}
