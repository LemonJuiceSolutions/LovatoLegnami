/**
 * Versioni del formato SAT supportate (D7) e layout dei record per versione.
 * Il layout è la sola fonte dell'ordine dei campi: lo usano sia il writer
 * (`writer.ts`) sia il validatore (`validate.ts`), così una correzione dopo la
 * prova col CAM della CNC è una modifica di dati in questo file.
 *
 * Differenze tra versioni gestite:
 *
 * | | 4.0 | 7.0 | 21.0 |
 * |---|---|---|---|
 * | riga 1 dell'header | `400 0 n 0` | `700 0 n 0` | `21000 0 n 0` |
 * | stringhe (header e record) | `<len> testo` | `@<len> testo` | `@<len> testo` |
 * | intero `-1` dopo il puntatore attributo | no | sì | sì |
 * | puntatore `pattern` (topologia e geometria) | no | sì | sì |
 * | parametri e convessità dello spigolo | no | sì | sì |
 *
 * Solo la 7.0 è coperta da test strutturali completi; per la 21.0 il layout
 * dei record è quello della 7.0 (vedi README, "Limiti").
 */

export const SAT_VERSIONS = ["4.0", "7.0", "21.0"] as const;
export type SatVersion = (typeof SAT_VERSIONS)[number];
export const DEFAULT_SAT_VERSION: SatVersion = "7.0";

export interface SatVersionInfo {
  readonly version: SatVersion;
  /** Numero di versione nella riga 1 dell'header (es. 700). */
  readonly code: number;
  /** Stringa di versione ACIS nella riga 2 dell'header. */
  readonly acisVersion: string;
  /** Stringhe con prefisso `@<len>` (≥ 7.0) invece di `<len>`. */
  readonly atStrings: boolean;
  /** Intero id (`-1`) dopo il puntatore attributo di ogni record. */
  readonly entityId: boolean;
  /** Puntatore `pattern` (`$-1`) sulle entità topologiche e geometriche. */
  readonly pattern: boolean;
  /** Parametri di inizio/fine sulla curva nello spigolo. */
  readonly edgeParams: boolean;
  /** Stringa di convessità in coda allo spigolo (`@7 unknown`). */
  readonly edgeConvexity: boolean;
  readonly endMarker: string;
  /** Coperta da test strutturali completi. */
  readonly tested: boolean;
}

export const SAT_VERSION_INFO: Readonly<Record<SatVersion, SatVersionInfo>> = {
  "4.0": {
    version: "4.0",
    code: 400,
    acisVersion: "ACIS 4.0 NT",
    atStrings: false,
    entityId: false,
    pattern: false,
    edgeParams: false,
    edgeConvexity: false,
    endMarker: "End-of-ACIS-data",
    tested: false,
  },
  "7.0": {
    version: "7.0",
    code: 700,
    acisVersion: "ACIS 7.0 NT",
    atStrings: true,
    entityId: true,
    pattern: true,
    edgeParams: true,
    edgeConvexity: true,
    endMarker: "End-of-ACIS-data",
    tested: true,
  },
  "21.0": {
    version: "21.0",
    code: 21000,
    acisVersion: "ACIS 21.0 NT",
    atStrings: true,
    entityId: true,
    pattern: true,
    edgeParams: true,
    edgeConvexity: true,
    endMarker: "End-of-ACIS-data",
    tested: false,
  },
};

export const isSatVersion = (v: unknown): v is SatVersion => (SAT_VERSIONS as readonly unknown[]).includes(v);

export function satVersionInfo(version: SatVersion): SatVersionInfo {
  const info = SAT_VERSION_INFO[version];
  if (!info) throw new Error(`SAT: versione non supportata "${version}" (ammesse: ${SAT_VERSIONS.join(", ")})`);
  return info;
}

/** Versione supportata corrispondente a un codice di header (es. 700 → "7.0"), se esiste. */
export const versionFromCode = (code: number): SatVersion | undefined =>
  SAT_VERSIONS.find((v) => SAT_VERSION_INFO[v].code === code);

// ---------------------------------------------------------------------------
// Header

/** Riga 3: 1 unità = 1 mm, tolleranza di risoluzione (resabs) e normale (resnor) ACIS standard. */
export const SAT_UNITS_LINE = "1 9.9999999999999995e-007 1e-010";
export const SAT_UNIT_MM = 1;

/** Testo ridotto ad ASCII stampabile (lunghezze in byte = caratteri; accenti rimossi). */
export function satAscii(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "_");
}

/** Stringa SAT: `@<len> testo` (≥ 7.0) oppure `<len> testo`. */
export function formatSatString(info: SatVersionInfo, text: string): string {
  const s = satAscii(text);
  return `${info.atStrings ? "@" : ""}${s.length} ${s}`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (n: number) => String(n).padStart(2, "0");

/** Data nel formato C `ctime` (ora locale, 24 caratteri): `Wed Oct 14 09:30:00 2026`. */
export function ctimeString(d: Date): string {
  const day = String(d.getDate()).padStart(2, " ");
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${day} ${time} ${d.getFullYear()}`;
}

export interface SatHeaderInput {
  /** Campo "produttore/CAM" (product id). */
  readonly producer: string;
  readonly date: Date;
  readonly bodyCount: number;
}

/**
 * Le 3 righe dell'header: `<versione> <n. record> <n. body> <flag history>`
 * (n. record `0` = "non dichiarato", come scrive ACIS; il lettore si ferma
 * al terminatore), product id / versione ACIS / data, unità e tolleranze.
 */
export function satHeader(info: SatVersionInfo, input: SatHeaderInput): [string, string, string] {
  const str = (s: string) => formatSatString(info, s);
  const producer = input.producer.trim() || "unknown";
  return [
    `${info.code} 0 ${input.bodyCount} 0`,
    `${str(producer)} ${str(info.acisVersion)} ${str(ctimeString(input.date))}`,
    SAT_UNITS_LINE,
  ];
}

// ---------------------------------------------------------------------------
// Layout dei record

/**
 * Tipo di un campo. `ref.to`: tipi di entità ammessi (`*suffisso` = tipi che
 * finiscono con il suffisso, `*` = qualunque); `to` vuoto = solo `$-1`.
 */
export type SatFieldType =
  | { readonly kind: "ref"; readonly to: readonly string[]; readonly nullable: boolean }
  | { readonly kind: "int" }
  | { readonly kind: "num" }
  | { readonly kind: "vec" }
  | { readonly kind: "keyword"; readonly values?: readonly string[] }
  | { readonly kind: "string" }
  | { readonly kind: "interval" };

export interface SatFieldSpec {
  readonly name: string;
  readonly type: SatFieldType;
}

const ref = (name: string, to: string[], nullable = false): SatFieldSpec => ({
  name,
  type: { kind: "ref", to, nullable },
});
const nil = (name: string): SatFieldSpec => ({ name, type: { kind: "ref", to: [], nullable: true } });
const num = (name: string): SatFieldSpec => ({ name, type: { kind: "num" } });
const vec = (name: string): SatFieldSpec => ({ name, type: { kind: "vec" } });
const kw = (name: string, values?: string[]): SatFieldSpec => ({ name, type: { kind: "keyword", values } });
const str = (name: string): SatFieldSpec => ({ name, type: { kind: "string" } });
const intervals = (...names: string[]): SatFieldSpec[] => names.map((name) => ({ name, type: { kind: "interval" } }));
const SENSE = ["forward", "reversed"];

/** Nome del tipo dell'attributo stringa generico usato per il nome del body. */
export const STRING_ATTRIB = "string_attrib-name_attrib-gen-attrib";

const SPECIFIC: Readonly<Record<string, (info: SatVersionInfo) => SatFieldSpec[]>> = {
  body: () => [ref("lump", ["lump"]), nil("wire"), ref("transform", ["transform"], true)],
  lump: () => [ref("next", ["lump"], true), ref("shell", ["shell"]), ref("body", ["body"])],
  shell: () => [ref("next", ["shell"], true), nil("subshell"), ref("face", ["face"]), nil("wire"), ref("lump", ["lump"])],
  face: () => [
    ref("next", ["face"], true),
    ref("loop", ["loop"]),
    ref("shell", ["shell"]),
    nil("subshell"),
    ref("surface", ["*-surface"]),
    kw("sense", SENSE),
    kw("sides", ["single"]),
  ],
  loop: () => [ref("next", ["loop"], true), ref("coedge", ["coedge"]), ref("face", ["face"])],
  coedge: () => [
    ref("next", ["coedge"]),
    ref("prev", ["coedge"]),
    ref("partner", ["coedge"], true),
    ref("edge", ["edge"]),
    kw("sense", SENSE),
    ref("loop", ["loop"]),
    ref("pcurve", ["pcurve"], true),
  ],
  edge: (info) => [
    ref("start", ["vertex"]),
    ...(info.edgeParams ? [num("startParam")] : []),
    ref("end", ["vertex"]),
    ...(info.edgeParams ? [num("endParam")] : []),
    ref("coedge", ["coedge"]),
    ref("curve", ["*-curve"]),
    kw("sense", SENSE),
    ...(info.edgeConvexity ? [str("convexity")] : []),
  ],
  vertex: () => [ref("edge", ["edge"]), ref("point", ["point"])],
  point: () => [vec("location")],
  "straight-curve": () => [vec("root"), vec("direction"), ...intervals("t0", "t1")],
  "ellipse-curve": () => [vec("center"), vec("normal"), vec("major"), num("ratio"), ...intervals("t0", "t1")],
  "plane-surface": () => [
    vec("root"),
    vec("normal"),
    vec("uDir"),
    kw("reverseV", ["forward_v", "reversed_v"]),
    ...intervals("u0", "u1", "v0", "v1"),
  ],
  "cone-surface": () => [
    vec("center"),
    vec("normal"),
    vec("major"),
    num("ratio"),
    ...intervals("t0", "t1"),
    num("sinHalfAngle"),
    num("cosHalfAngle"),
    num("uScale"),
    kw("reverseU", SENSE),
    ...intervals("u0", "u1", "v0", "v1"),
  ],
  [STRING_ATTRIB]: () => [
    ref("next", ["*attrib"], true),
    ref("prev", ["*attrib"], true),
    ref("owner", ["*"]),
    kw("split"),
    kw("merge"),
    kw("trans"),
    kw("copy"),
    str("name"),
    str("value"),
  ],
};

const TOPOLOGY = new Set(["body", "lump", "shell", "face", "loop", "coedge", "edge", "vertex"]);
const isGeometry = (type: string) => type === "point" || type.endsWith("-curve") || type.endsWith("-surface");

/** Tipi di entità che il writer sa scrivere e il validatore sa leggere. */
export const SAT_ENTITY_TYPES: readonly string[] = Object.keys(SPECIFIC);

/**
 * Campi di un record nell'ordine del file, intestazione comune compresa:
 * puntatore attributo, poi (≥ 7.0) id `-1` e, per topologia e geometria,
 * puntatore `pattern`. `undefined` per i tipi non gestiti.
 */
export function recordLayout(info: SatVersionInfo, type: string): readonly SatFieldSpec[] | undefined {
  const specific = SPECIFIC[type];
  if (!specific) return undefined;
  const common: SatFieldSpec[] = [ref("attrib", ["*attrib"], true)];
  if (info.entityId) common.push({ name: "id", type: { kind: "int" } });
  if (info.pattern && (TOPOLOGY.has(type) || isGeometry(type))) common.push(nil("pattern"));
  return [...common, ...specific(info)];
}

/** `true` se il tipo `type` è ammesso dal modello `pattern` di un campo `ref`. */
export const typeMatches = (pattern: string, type: string): boolean =>
  pattern === "*" ? true : pattern.startsWith("*") ? type.endsWith(pattern.slice(1)) : pattern === type;
