import type { SatExportOptions } from "./options";
import { scanSat } from "./validate";
import { SAT_VERSIONS, SAT_VERSION_INFO, STRING_ATTRIB, versionFromCode, type SatVersion } from "./versions";

/**
 * Confronto con il SAT campione accettato dalla CNC (D7, spec `export-cnc`
 * "Validazione contro SAT campione"): estrae da entrambi i file versione,
 * unità, tipi di entità e attributi e riporta le differenze, con un
 * suggerimento sull'opzione da cambiare quando ce n'è una.
 */

export interface SatSummary {
  readonly versionCode: number;
  /** Versione supportata dal configuratore con lo stesso codice, se esiste. */
  readonly version?: SatVersion;
  readonly producer?: string;
  readonly acisVersion?: string;
  /** mm per unità del modello. */
  readonly units?: number;
  readonly terminator?: string;
  readonly bodyCount: number;
  /** Numero di record per tipo di entità. */
  readonly entityTypes: Readonly<Record<string, number>>;
  /** Tipi di attributo (record il cui tipo finisce con `attrib`). */
  readonly attributeTypes: readonly string[];
  /** Nomi degli attributi generici (prima stringa dei record `*-gen-attrib`). */
  readonly attributeNames: readonly string[];
}

export type SatSuggestion = {
  [K in keyof SatExportOptions]: { readonly option: K; readonly value: SatExportOptions[K] };
}[keyof SatExportOptions];

export interface SatDifference {
  readonly aspect: "header" | "versione" | "unità" | "entità" | "attributi" | "body";
  /** `errore`: probabile rifiuto del CAM; `avviso`: da verificare; `info`: differenza innocua. */
  readonly severity: "errore" | "avviso" | "info";
  readonly message: string;
  readonly ours?: string;
  readonly sample?: string;
  readonly suggestion?: SatSuggestion;
}

export interface SatComparison {
  /** Nessuna differenza di severità `errore` o `avviso`. */
  readonly compatible: boolean;
  readonly differences: readonly SatDifference[];
  readonly ours: SatSummary;
  readonly sample: SatSummary;
}

export function summarizeSat(text: string): SatSummary {
  const scan = scanSat(text);
  const entityTypes: Record<string, number> = {};
  const attributeTypes = new Set<string>();
  const attributeNames = new Set<string>();
  for (const r of scan.records) {
    entityTypes[r.type] = (entityTypes[r.type] ?? 0) + 1;
    if (r.type.endsWith("attrib")) {
      attributeTypes.add(r.type);
      if (r.type.endsWith("gen-attrib") && r.strings.length > 0) attributeNames.add(r.strings[0]);
    }
  }
  return {
    versionCode: scan.header.code,
    version: versionFromCode(scan.header.code),
    producer: scan.header.producer,
    acisVersion: scan.header.acisVersion,
    units: scan.header.units,
    terminator: scan.terminator,
    bodyCount: entityTypes.body ?? 0,
    entityTypes,
    attributeTypes: [...attributeTypes].sort(),
    attributeNames: [...attributeNames].sort(),
  };
}

/** Versione supportata più adatta a un codice di header: la stessa o la più recente non successiva. */
export function suggestVersion(code: number): SatVersion {
  const exact = versionFromCode(code);
  if (exact) return exact;
  const older = SAT_VERSIONS.filter((v) => SAT_VERSION_INFO[v].code <= code);
  return older.length > 0 ? older[older.length - 1] : SAT_VERSIONS[0];
}

const versionLabel = (s: SatSummary) => `${s.acisVersion ?? "?"} (${s.versionCode})`;
const isModelEntity = (t: string) => !t.endsWith("attrib") && t !== "transform";

export function compareWithSample(oursText: string, sampleText: string): SatComparison {
  const ours = summarizeSat(oursText);
  const sample = summarizeSat(sampleText);
  const differences: SatDifference[] = [];

  if (!Number.isFinite(sample.versionCode)) {
    differences.push({
      aspect: "header",
      severity: "errore",
      message: "Il campione non ha un header SAT leggibile (riga 1: versione, record, body, flag)",
    });
    return { compatible: false, differences, ours, sample };
  }

  if (ours.versionCode !== sample.versionCode) {
    const value = suggestVersion(sample.versionCode);
    const newer = ours.versionCode > sample.versionCode;
    differences.push({
      aspect: "versione",
      severity: newer ? "errore" : "avviso",
      message:
        `Versione diversa: campione ${versionLabel(sample)}, nostro ${versionLabel(ours)}. ` +
        (newer
          ? "Un lettore ACIS non legge file più recenti della propria versione."
          : "Il CAM dovrebbe leggere versioni precedenti, ma conviene usare la stessa del campione.") +
        ` Impostare la versione ${value}.`,
      ours: String(ours.versionCode),
      sample: String(sample.versionCode),
      suggestion: { option: "version", value },
    });
  }

  if (sample.terminator && ours.terminator && sample.terminator !== ours.terminator)
    differences.push({
      aspect: "header",
      severity: "avviso",
      message: `Terminatore diverso: campione "${sample.terminator}", nostro "${ours.terminator}"${
        sample.terminator === "End-of-ASM-data" ? " (il campione è un file Autodesk ASM)" : ""
      }`,
      ours: ours.terminator,
      sample: sample.terminator,
    });

  if (sample.units !== undefined && ours.units !== undefined && sample.units !== ours.units)
    differences.push({
      aspect: "unità",
      severity: "avviso",
      message:
        `Unità diverse: nel campione 1 unità = ${sample.units} mm, nel nostro 1 unità = ${ours.units} mm. ` +
        "Il configuratore scrive solo in mm: verificare la scala all'import nel CAM.",
      ours: String(ours.units),
      sample: String(sample.units),
    });

  const oursTypes = Object.keys(ours.entityTypes).filter(isModelEntity);
  const sampleTypes = new Set(Object.keys(sample.entityTypes));
  const missing = oursTypes.filter((t) => !sampleTypes.has(t)).sort();
  if (missing.length > 0 && sample.bodyCount > 0)
    differences.push({
      aspect: "entità",
      severity: "avviso",
      message: `Il campione non contiene ${missing.join(", ")}: verificare che il CAM importi queste entità${
        missing.includes("cone-surface") ? " (i fori sono cone-surface)" : ""
      }.`,
      ours: missing.join(", "),
    });
  const extra = [...sampleTypes].filter((t) => isModelEntity(t) && !(t in ours.entityTypes)).sort();
  if (extra.length > 0)
    differences.push({
      aspect: "entità",
      severity: "info",
      message: `Il campione usa entità che il configuratore non scrive: ${extra.join(", ")}.`,
      sample: extra.join(", "),
    });

  compareAttributes(ours, sample, differences);

  if (sample.bodyCount === 1 && ours.bodyCount > 1)
    differences.push({
      aspect: "body",
      severity: "info",
      message: `Il campione contiene un solo body, il nostro file ${ours.bodyCount}: se il CAM importa un pezzo per file, usare la modalità "un file per pezzo".`,
      ours: String(ours.bodyCount),
      sample: "1",
      suggestion: { option: "fileMode", value: "un-file-per-pezzo" },
    });

  return {
    compatible: !differences.some((d) => d.severity !== "info"),
    differences,
    ours,
    sample,
  };
}

function compareAttributes(ours: SatSummary, sample: SatSummary, out: SatDifference[]): void {
  const oursNamed = ours.attributeTypes.includes(STRING_ATTRIB);
  if (oursNamed && sample.attributeTypes.length === 0) {
    out.push({
      aspect: "attributi",
      severity: "info",
      message:
        "Il campione non ha attributi; il nostro file ha il nome del body come attributo stringa. " +
        "Se il CAM rifiuta il file, provare senza nome body.",
      ours: ours.attributeNames.join(", "),
      suggestion: { option: "includeName", value: false },
    });
    return;
  }
  if (!oursNamed && sample.attributeTypes.includes(STRING_ATTRIB)) {
    out.push({
      aspect: "attributi",
      severity: "info",
      message: "Il campione usa attributi stringa (probabili nomi dei body): attivare il nome body.",
      sample: sample.attributeNames.join(", "),
      suggestion: { option: "includeName", value: true },
    });
    return;
  }
  if (oursNamed && sample.attributeTypes.includes(STRING_ATTRIB)) {
    const ourName = ours.attributeNames[0];
    if (ourName && !sample.attributeNames.includes(ourName) && sample.attributeNames.length > 0)
      out.push({
        aspect: "attributi",
        severity: "avviso",
        message: `Nome dell'attributo diverso: campione ${sample.attributeNames.join(", ")}, nostro ${ourName}.`,
        ours: ourName,
        sample: sample.attributeNames.join(", "),
        suggestion: { option: "nameAttribute", value: sample.attributeNames[0] },
      });
  }
  const extra = sample.attributeTypes.filter((t) => !ours.attributeTypes.includes(t));
  if (extra.length > 0)
    out.push({
      aspect: "attributi",
      severity: "info",
      message: `Attributi presenti solo nel campione: ${extra.join(", ")}.`,
      sample: extra.join(", "),
    });
}
