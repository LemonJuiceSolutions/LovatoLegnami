import { add, cross, distance, scale, type Vec3 } from "@/domain/math/vec3";
import {
  STRING_ATTRIB,
  recordLayout,
  satVersionInfo,
  typeMatches,
  versionFromCode,
  type SatFieldSpec,
  type SatVersion,
  type SatVersionInfo,
} from "./versions";

/**
 * Validatore strutturale dei file SAT prodotti dal writer (D7): legge header e
 * record con i layout di `versions.ts` e verifica riferimenti (`$n` → entità
 * esistente di tipo compatibile), raggiungibilità dal body, catene
 * body/lump/shell/face/loop, coerenza `next`/`prev`/`partner` dei coedge,
 * chiusura dei loop, spigoli manifold, vertici sulle curve e conteggi.
 * Serve ai test e alla UI ("Verifica file"); per file di terzi (es. il SAT
 * campione della CNC) usare `scanSat`, che non presuppone il nostro layout.
 */

export type SatFieldValue = number | string | Vec3 | null;

export interface SatParsedRecord {
  readonly index: number;
  readonly type: string;
  /** Campi per nome; i `ref` sono indici (`-1` = nullo), gli intervalli `I` sono `null`. */
  readonly fields: Readonly<Record<string, SatFieldValue>>;
}

export interface SatHeaderInfo {
  readonly code: number;
  readonly recordCount: number;
  readonly bodyCount: number;
  readonly flags: number;
  readonly producer?: string;
  readonly acisVersion?: string;
  readonly date?: string;
  /** mm per unità del modello (riga 3, primo valore). */
  readonly units?: number;
  readonly resabs?: number;
  readonly resnor?: number;
}

export interface SatValidation {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly version?: SatVersion;
  readonly header?: SatHeaderInfo;
  readonly records: readonly SatParsedRecord[];
  readonly counts: Readonly<Record<string, number>>;
  /** Body nell'ordine del file con il nome letto dall'attributo stringa (se presente). */
  readonly bodies: readonly { readonly record: number; readonly name?: string }[];
}

// ---------------------------------------------------------------------------
// Lettura a token

class SatCursor {
  pos = 0;
  constructor(readonly text: string) {}

  private skipWs(): void {
    while (this.pos < this.text.length && /\s/.test(this.text[this.pos])) this.pos++;
  }

  atEnd(): boolean {
    this.skipWs();
    return this.pos >= this.text.length;
  }

  token(): string | undefined {
    this.skipWs();
    if (this.pos >= this.text.length) return undefined;
    const start = this.pos;
    while (this.pos < this.text.length && !/\s/.test(this.text[this.pos])) this.pos++;
    return this.text.slice(start, this.pos);
  }

  /** Stringa `@<len> testo` (o `<len> testo` se `at` è falso): esattamente `len` caratteri dopo uno spazio. */
  string(at: boolean): string {
    const t = this.token();
    const m = t === undefined ? null : (at ? /^@(\d+)$/ : /^(\d+)$/).exec(t);
    if (!m) throw new Error(`attesa stringa ${at ? "@<len>" : "<len>"}, trovato "${t ?? "fine file"}"`);
    const len = Number(m[1]);
    if (this.text[this.pos] !== " " && len > 0) throw new Error(`stringa @${len} senza spazio separatore`);
    const s = this.text.slice(this.pos + 1, this.pos + 1 + len);
    if (s.length < len) throw new Error(`stringa @${len} troncata`);
    this.pos += 1 + len;
    return s;
  }

  /** Salta fino al token `#` (stringhe `@<len>` comprese) per riprendere dopo un record illeggibile. */
  skipRecord(): void {
    for (;;) {
      const save = this.pos;
      const t = this.token();
      if (t === undefined || t === "#") return;
      if (/^@\d+$/.test(t)) {
        this.pos = save;
        try {
          this.string(true);
        } catch {
          this.pos = save;
          this.token();
        }
      }
    }
  }
}

const NUMBER_RE = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

function readField(cur: SatCursor, info: SatVersionInfo, spec: SatFieldSpec): SatFieldValue {
  const t = spec.type;
  const num = () => {
    const tok = cur.token();
    if (tok === undefined || !NUMBER_RE.test(tok)) throw new Error(`campo ${spec.name}: atteso numero, trovato "${tok}"`);
    return Number(tok);
  };
  switch (t.kind) {
    case "ref": {
      const tok = cur.token();
      const m = tok === undefined ? null : /^\$(-?\d+)$/.exec(tok);
      if (!m) throw new Error(`campo ${spec.name}: atteso riferimento $n, trovato "${tok}"`);
      return Number(m[1]);
    }
    case "int": {
      const tok = cur.token();
      if (tok === undefined || !/^-?\d+$/.test(tok)) throw new Error(`campo ${spec.name}: atteso intero, trovato "${tok}"`);
      return Number(tok);
    }
    case "num":
      return num();
    case "vec":
      return { x: num(), y: num(), z: num() };
    case "keyword": {
      const tok = cur.token();
      if (tok === undefined || (t.values && !t.values.includes(tok)))
        throw new Error(`campo ${spec.name}: atteso ${t.values?.join("|") ?? "parola chiave"}, trovato "${tok}"`);
      return tok;
    }
    case "string":
      return cur.string(info.atStrings);
    case "interval": {
      const tok = cur.token();
      if (tok === "I") return null;
      if (tok === undefined || !NUMBER_RE.test(tok)) throw new Error(`campo ${spec.name}: atteso intervallo, trovato "${tok}"`);
      return Number(tok);
    }
  }
}

function splitHeader(text: string): { lines: string[]; rest: string } {
  const lines: string[] = [];
  let pos = 0;
  for (let i = 0; i < 3 && pos <= text.length; i++) {
    let nl = text.indexOf("\n", pos);
    if (nl < 0) nl = text.length;
    lines.push(text.slice(pos, nl).replace(/\r$/, ""));
    pos = nl + 1;
  }
  return { lines, rest: text.slice(Math.min(pos, text.length)) };
}

/** Legge l'header (righe 1–3); `at` = stringhe con `@` nella riga 2. */
export function parseSatHeader(text: string): { header: SatHeaderInfo; rest: string; errors: string[] } {
  const errors: string[] = [];
  const { lines, rest } = splitHeader(text);
  const l1 = (lines[0] ?? "").trim().split(/\s+/).map(Number);
  if (l1.length < 4 || l1.slice(0, 4).some((n) => !Number.isInteger(n)))
    errors.push(`header riga 1: attesi 4 interi (versione, record, body, flag), trovato "${lines[0] ?? ""}"`);
  const [code = NaN, recordCount = 0, bodyCount = 0, flags = 0] = l1;
  let producer: string | undefined;
  let acisVersion: string | undefined;
  let date: string | undefined;
  const l2 = lines[1] ?? "";
  try {
    const cur = new SatCursor(l2);
    const at = l2.trimStart().startsWith("@");
    producer = cur.string(at);
    acisVersion = cur.string(at);
    date = cur.string(at);
  } catch (e) {
    errors.push(`header riga 2 (product id, versione ACIS, data): ${(e as Error).message}`);
  }
  const l3 = (lines[2] ?? "").trim().split(/\s+/).map(Number);
  if (l3.length < 3 || l3.slice(0, 3).some((n) => !Number.isFinite(n)))
    errors.push(`header riga 3: attesi unità e tolleranze, trovato "${lines[2] ?? ""}"`);
  return {
    header: { code, recordCount, bodyCount, flags, producer, acisVersion, date, units: l3[0], resabs: l3[1], resnor: l3[2] },
    rest,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Validazione

const MAX_ERRORS = 200;

export function validateSat(text: string): SatValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => {
    if (errors.length < MAX_ERRORS) errors.push(m);
  };
  const { header, rest, errors: headerErrors } = parseSatHeader(text);
  headerErrors.forEach(err);
  const version = versionFromCode(header.code);
  const result = (records: SatParsedRecord[] = [], bodies: SatValidation["bodies"] = []): SatValidation => {
    const counts: Record<string, number> = {};
    for (const r of records) counts[r.type] = (counts[r.type] ?? 0) + 1;
    return { ok: errors.length === 0, errors, warnings, version, header, records, counts, bodies };
  };
  if (!version) {
    err(`versione ${header.code} non supportata dal validatore`);
    return result();
  }
  const info = satVersionInfo(version);
  if (header.units !== undefined && header.units !== 1) warnings.push(`unità ${header.units} mm per unità (atteso 1 = mm)`);

  // Record
  const records: SatParsedRecord[] = [];
  const cur = new SatCursor(rest);
  let terminated = false;
  while (!cur.atEnd()) {
    let type = cur.token()!;
    if (type.startsWith("End-of-")) {
      if (type !== info.endMarker) warnings.push(`terminatore "${type}" invece di "${info.endMarker}"`);
      terminated = true;
      break;
    }
    const index = records.length;
    if (/^-\d+$/.test(type)) {
      if (Number(type.slice(1)) !== index) err(`record ${index}: indice esplicito ${type} fuori sequenza`);
      type = cur.token() ?? "";
    }
    const layout = recordLayout(info, type);
    const fields: Record<string, SatFieldValue> = {};
    if (!layout) {
      err(`record ${index}: tipo di entità "${type}" non supportato`);
      cur.skipRecord();
    } else {
      try {
        for (const spec of layout) fields[spec.name] = readField(cur, info, spec);
        const end = cur.token();
        if (end !== "#") throw new Error(`atteso "#" a fine record, trovato "${end ?? "fine file"}"`);
      } catch (e) {
        err(`record ${index} (${type}): ${(e as Error).message}`);
        cur.skipRecord();
      }
    }
    records.push({ index, type, fields });
  }
  if (!terminated) err(`terminatore "${info.endMarker}" mancante`);
  if (!cur.atEnd()) warnings.push("testo dopo il terminatore ignorato");

  const ref = (r: SatParsedRecord, name: string): SatParsedRecord | undefined => {
    const v = r.fields[name];
    return typeof v === "number" && v >= 0 ? records[v] : undefined;
  };

  // Riferimenti: esistenza, tipo compatibile, nullabilità.
  let refsOk = true;
  for (const r of records) {
    for (const spec of recordLayout(info, r.type) ?? []) {
      if (spec.type.kind !== "ref" || !(spec.name in r.fields)) continue;
      const v = r.fields[spec.name] as number;
      const where = `record ${r.index} (${r.type}).${spec.name}`;
      if (v < 0) {
        if (v !== -1) err(`${where}: riferimento negativo $${v}`);
        else if (!spec.type.nullable) err(`${where}: riferimento obbligatorio nullo`);
        continue;
      }
      if (v >= records.length) {
        err(`${where}: $${v} non esiste (record: ${records.length})`);
        refsOk = false;
        continue;
      }
      const target = records[v].type;
      if (spec.type.to.length === 0) err(`${where}: atteso $-1, trovato $${v} (${target})`);
      else if (!spec.type.to.some((p) => typeMatches(p, target))) {
        err(`${where}: $${v} è ${target}, atteso ${spec.type.to.join(" | ")}`);
        refsOk = false;
      }
    }
  }

  const bodyRecords = records.filter((r) => r.type === "body");
  if (bodyRecords.length !== header.bodyCount)
    err(`header: dichiarati ${header.bodyCount} body, trovati ${bodyRecords.length}`);
  if (bodyRecords.length === 0) err("nessun body nel file");

  const bodies = bodyRecords.map((b) => ({ record: b.index, name: refsOk ? bodyName(records, b) : undefined }));
  if (!refsOk || errors.length > 0) return result(records, bodies);

  // Raggiungibilità dal body (tutti i campi ref).
  const reached = new Set<number>();
  const stack = bodyRecords.map((b) => b.index);
  while (stack.length > 0) {
    const i = stack.pop()!;
    if (reached.has(i)) continue;
    reached.add(i);
    for (const spec of recordLayout(info, records[i].type) ?? [])
      if (spec.type.kind === "ref") {
        const v = records[i].fields[spec.name];
        if (typeof v === "number" && v >= 0 && !reached.has(v)) stack.push(v);
      }
  }
  for (const r of records) if (!reached.has(r.index)) err(`record ${r.index} (${r.type}): non raggiungibile da nessun body`);

  checkTopology(records, ref, err);
  if (info.edgeParams) checkEdgeGeometry(records, ref, err);
  checkAttributes(records, ref, err);
  return result(records, bodies);
}

type RefFn = (r: SatParsedRecord, name: string) => SatParsedRecord | undefined;

/** Percorre una lista collegata da `next` (fermandosi sui cicli). */
function chain(first: SatParsedRecord | undefined, ref: RefFn, onCycle: () => void): SatParsedRecord[] {
  const out: SatParsedRecord[] = [];
  const seen = new Set<number>();
  for (let r = first; r; r = ref(r, "next")) {
    if (seen.has(r.index)) {
      onCycle();
      break;
    }
    seen.add(r.index);
    out.push(r);
  }
  return out;
}

function coedgeVertices(c: SatParsedRecord, ref: RefFn): { from?: number; to?: number } {
  const e = ref(c, "edge");
  if (!e) return {};
  const s = e.fields.start as number;
  const t = e.fields.end as number;
  return c.fields.sense === "forward" ? { from: s, to: t } : { from: t, to: s };
}

function checkTopology(records: SatParsedRecord[], ref: RefFn, err: (m: string) => void): void {
  const at = (r: SatParsedRecord) => `${r.type} ${r.index}`;
  const coedgesOfEdge = new Map<number, number>();
  for (const body of records.filter((r) => r.type === "body")) {
    for (const lump of chain(ref(body, "lump"), ref, () => err(`${at(body)}: ciclo nei lump`))) {
      if (lump.fields.body !== body.index) err(`${at(lump)}: body ≠ ${body.index}`);
      for (const shell of chain(ref(lump, "shell"), ref, () => err(`${at(lump)}: ciclo nelle shell`))) {
        if (shell.fields.lump !== lump.index) err(`${at(shell)}: lump ≠ ${lump.index}`);
        for (const face of chain(ref(shell, "face"), ref, () => err(`${at(shell)}: ciclo nelle facce`))) {
          if (face.fields.shell !== shell.index) err(`${at(face)}: shell ≠ ${shell.index}`);
          for (const loop of chain(ref(face, "loop"), ref, () => err(`${at(face)}: ciclo nei loop`))) {
            if (loop.fields.face !== face.index) err(`${at(loop)}: faccia ≠ ${face.index}`);
            checkLoop(loop, records, ref, err, coedgesOfEdge);
          }
        }
      }
    }
  }
  for (const r of records) {
    if (r.type === "coedge") {
      const partner = ref(r, "partner");
      if (!partner) continue;
      if (partner.fields.edge !== r.fields.edge) err(`${at(r)}: partner ${partner.index} su un altro spigolo`);
      let p: SatParsedRecord | undefined = partner;
      for (let k = 0; p && p.index !== r.index && k < records.length; k++) p = ref(p, "partner");
      if (!p || p.index !== r.index) err(`${at(r)}: l'anello dei partner non torna al coedge`);
      if (ref(partner, "partner") === r && partner.fields.sense === r.fields.sense)
        err(`${at(r)}: partner ${partner.index} con lo stesso verso`);
    } else if (r.type === "edge") {
      const c = ref(r, "coedge");
      if (c && c.fields.edge !== r.index) err(`${at(r)}: il coedge ${c.index} appartiene a un altro spigolo`);
      const n = coedgesOfEdge.get(r.index) ?? 0;
      if (n !== 2) err(`${at(r)}: usato da ${n} coedge (atteso 2: solido chiuso)`);
    } else if (r.type === "vertex") {
      const e = ref(r, "edge");
      if (e && e.fields.start !== r.index && e.fields.end !== r.index)
        err(`${at(r)}: lo spigolo ${e.index} non ha questo vertice come estremo`);
    }
  }
}

function checkLoop(
  loop: SatParsedRecord,
  records: SatParsedRecord[],
  ref: RefFn,
  err: (m: string) => void,
  coedgesOfEdge: Map<number, number>,
): void {
  const start = ref(loop, "coedge");
  if (!start) return;
  let c: SatParsedRecord | undefined = start;
  for (let k = 0; c && k <= records.length; k++) {
    if (c.fields.loop !== loop.index) err(`loop ${loop.index}: il coedge ${c.index} appartiene al loop ${c.fields.loop}`);
    const next = ref(c, "next");
    if (!next) return;
    if (next.fields.prev !== c.index) err(`coedge ${c.index}: next ${next.index} ha prev ${next.fields.prev}`);
    const prev = ref(c, "prev");
    if (prev && prev.fields.next !== c.index) err(`coedge ${c.index}: prev ${prev.index} ha next ${prev.fields.next}`);
    if (coedgeVertices(c, ref).to !== coedgeVertices(next, ref).from)
      err(`loop ${loop.index}: il coedge ${c.index} non termina dove inizia il successivo ${next.index}`);
    const e = c.fields.edge as number;
    coedgesOfEdge.set(e, (coedgesOfEdge.get(e) ?? 0) + 1);
    c = next;
    if (c.index === start.index) return;
    if (c.fields.loop !== loop.index) break;
  }
  err(`loop ${loop.index}: loop aperto (la catena dei next non torna al primo coedge)`);
}

/** Verifica che i vertici stiano sulla curva ai parametri dello spigolo (tolleranza 1e-6 relativa). */
function checkEdgeGeometry(records: SatParsedRecord[], ref: RefFn, err: (m: string) => void): void {
  for (const e of records.filter((r) => r.type === "edge")) {
    const curve = ref(e, "curve");
    if (!curve) continue;
    const at = (t: number): Vec3 | undefined => {
      const f = curve.fields;
      if (curve.type === "straight-curve") return add(f.root as Vec3, scale(f.direction as Vec3, t));
      if (curve.type === "ellipse-curve") {
        const major = f.major as Vec3;
        const minor = scale(cross(f.normal as Vec3, major), f.ratio as number);
        return add(add(f.center as Vec3, scale(major, Math.cos(t))), scale(minor, Math.sin(t)));
      }
      return undefined;
    };
    const sense = e.fields.sense === "forward";
    for (const [vName, pName] of [
      ["start", "startParam"],
      ["end", "endParam"],
    ] as const) {
      const v = ref(e, vName);
      const p = v && ref(v, "point");
      const t = e.fields[pName] as number;
      const expected = at(sense ? t : -t);
      if (!p || !expected) continue;
      const loc = p.fields.location as Vec3;
      const tol = 1e-6 * Math.max(1, Math.abs(loc.x), Math.abs(loc.y), Math.abs(loc.z));
      if (distance(loc, expected) > tol)
        err(`edge ${e.index}: il vertice ${vName} non sta sulla curva al parametro ${t} (scarto ${distance(loc, expected)})`);
    }
  }
}

function checkAttributes(records: SatParsedRecord[], ref: RefFn, err: (m: string) => void): void {
  for (const a of records.filter((r) => r.type.endsWith("attrib"))) {
    const owner = ref(a, "owner");
    if (!owner) continue;
    const list = chain(ref(owner, "attrib"), ref, () => err(`attributi di ${owner.index}: ciclo`));
    if (!list.includes(a)) err(`attributo ${a.index}: non è nella catena di attributi del proprietario ${owner.index}`);
  }
}

function bodyName(records: SatParsedRecord[], body: SatParsedRecord): string | undefined {
  const seen = new Set<number>();
  for (let i = body.fields.attrib as number; i >= 0 && i < records.length && !seen.has(i); ) {
    seen.add(i);
    const a = records[i];
    if (a.type === STRING_ATTRIB && typeof a.fields.value === "string") return a.fields.value;
    i = typeof a.fields.next === "number" ? a.fields.next : -1;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Lettura tollerante (file di terzi)

export interface SatScan {
  readonly header: SatHeaderInfo;
  readonly headerErrors: readonly string[];
  /** Record nell'ordine del file: tipo e stringhe `@<len>` trovate. */
  readonly records: readonly { readonly type: string; readonly strings: readonly string[] }[];
  readonly terminator?: string;
}

/**
 * Lettura senza layout: header, tipo di ogni record (con o senza indice
 * esplicito `-n`), stringhe `@<len>` (per i nomi degli attributi) e
 * terminatore. Adatta al SAT campione della CNC, qualunque sia il produttore.
 */
export function scanSat(text: string): SatScan {
  const { header, rest, errors } = parseSatHeader(text);
  const cur = new SatCursor(rest);
  const records: { type: string; strings: string[] }[] = [];
  let terminator: string | undefined;
  while (!cur.atEnd()) {
    let type = cur.token()!;
    if (type.startsWith("End-of-")) {
      terminator = type;
      break;
    }
    if (/^-\d+$/.test(type)) type = cur.token() ?? "";
    const strings: string[] = [];
    for (;;) {
      const save = cur.pos;
      const t = cur.token();
      if (t === undefined || t === "#") break;
      if (/^@\d+$/.test(t)) {
        cur.pos = save;
        try {
          strings.push(cur.string(true));
        } catch {
          cur.pos = save;
          cur.token();
        }
      }
    }
    records.push({ type, strings });
  }
  return { header, headerErrors: errors, records, terminator };
}
