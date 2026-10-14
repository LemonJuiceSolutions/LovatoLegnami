import type { Mat4 } from "../math/mat4";

/**
 * Modello dati del pezzo lavorato (D2). Unità: mm e gradi.
 *
 * Sistema locale del pezzo: asse X lungo la lunghezza (da 0 a `length`),
 * Y lungo la base della sezione, Z lungo l'altezza; la sezione è centrata
 * sull'asse X (Y ∈ [−b/2, b/2], Z ∈ [−h/2, h/2]). È la stessa convenzione
 * assunta da `obbFromPose` in `math/obb.ts`.
 */

/** Catalogo chiuso dei tipi di componente primitivo. */
export const PIECE_TYPES = [
  "pilastro",
  "trave",
  "travetto",
  "puntone",
  "colmo",
  "controvento",
  "banchina",
  // estensione `tipologie-estese` (E1)
  "tavola",
  "arco",
  "cantonale",
  "monaco",
  "mensola",
  "fascia",
  "grigliato",
] as const;
export type PieceType = (typeof PIECE_TYPES)[number];

/** Famiglia del pezzo = prefisso degli id stabili `<FAM>-<nn>` (D2). */
export const PIECE_FAMILIES = [
  "PIL",
  "TRV",
  "TVT",
  "PNT",
  "COL",
  "CTV",
  "BNC",
  "TAV",
  "ARC",
  "CAN",
  "MON",
  "MEN",
  "FAS",
  "GRG",
] as const;
export type PieceFamily = (typeof PIECE_FAMILIES)[number];

export const FAMILY_OF: Readonly<Record<PieceType, PieceFamily>> = {
  pilastro: "PIL",
  trave: "TRV",
  travetto: "TVT",
  puntone: "PNT",
  colmo: "COL",
  controvento: "CTV",
  banchina: "BNC",
  tavola: "TAV",
  arco: "ARC",
  cantonale: "CAN",
  monaco: "MON",
  mensola: "MEN",
  fascia: "FAS",
  grigliato: "GRG",
};

/** Tipi di pezzo che ammettono (e richiedono) l'asse curvo `curve`. */
export const CURVED_PIECE_TYPES: readonly PieceType[] = ["arco"];

export const isPieceType = (v: unknown): v is PieceType =>
  typeof v === "string" && (PIECE_TYPES as readonly string[]).includes(v);

/** Sezione rettangolare: `b` base (lungo Y locale), `h` altezza (lungo Z locale), mm. */
export interface Section {
  readonly b: number;
  readonly h: number;
}

/** Posa del pezzo: trasformazione rigida locale → assieme (Mat4 per righe, p' = M·p). */
export type Pose = Mat4;

/**
 * Facce di riferimento nel sistema locale del pezzo:
 * `superiore` (+Z), `inferiore` (−Z), `sinistra` (+Y), `destra` (−Y),
 * `testa-inizio` (X = 0), `testa-fine` (X = lunghezza).
 */
export const FACES = [
  "superiore",
  "inferiore",
  "sinistra",
  "destra",
  "testa-inizio",
  "testa-fine",
] as const;
export type Face = (typeof FACES)[number];
export type LateralFace = Exclude<Face, "testa-inizio" | "testa-fine">;
export type HeadFace = Extract<Face, "testa-inizio" | "testa-fine">;

export const MACHINING_TYPES = [
  "mezzo-legno",
  "tenone",
  "mortasa",
  "becco-uccello",
  "foro",
  "taglio-testa",
  // estensione `tipologie-estese` (E2)
  "asola-lama",
] as const;
export type MachiningType = (typeof MACHINING_TYPES)[number];

export const isMachiningType = (v: unknown): v is MachiningType =>
  typeof v === "string" && (MACHINING_TYPES as readonly string[]).includes(v);

/** Campi comuni a ogni lavorazione. */
interface MachiningBase {
  /** Id univoco nel pezzo, `<pieceId>-L<nn>`. */
  readonly id: string;
  /** Pezzo a cui appartiene la lavorazione. */
  readonly pieceId: string;
  /** Posizione lungo l'asse X locale del pezzo (mm, 0..lunghezza). */
  readonly at: number;
  /** Faccia di riferimento. */
  readonly face: Face;
  /** Giunto che ha generato la lavorazione, se presente. */
  readonly jointId?: string;
}

/**
 * Mezzo legno: tasca che attraversa tutta la faccia, larga `width` lungo X
 * (centrata in `at`) e profonda `depth` perpendicolarmente alla faccia.
 */
export interface MezzoLegno extends MachiningBase {
  readonly type: "mezzo-legno";
  readonly face: LateralFace;
  readonly width: number;
  readonly depth: number;
}

/**
 * Tenone di testa centrato sulla sezione: `width` lungo Y locale, `height`
 * lungo Z locale, `length` sporgenza lungo X (compresa nella lunghezza del pezzo).
 * `at` coincide con la testa (0 per `testa-inizio`, lunghezza per `testa-fine`).
 */
export interface Tenone extends MachiningBase {
  readonly type: "tenone";
  readonly face: HeadFace;
  readonly width: number;
  readonly height: number;
  readonly length: number;
}

/**
 * Mortasa: tasca rettangolare `width` × `height` sulla faccia, profonda `depth`.
 * Centro in (`at`, `offset`) dove `offset` è lo scostamento trasversale
 * dall'asse sulla faccia (lungo Y per superiore/inferiore, lungo Z per
 * sinistra/destra). `angle` è l'angolo (gradi, [0,180)) sulla faccia tra la
 * direzione di `width` e l'asse X del pezzo; `height` è perpendicolare.
 */
export interface Mortasa extends MachiningBase {
  readonly type: "mortasa";
  readonly face: LateralFace;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly offset: number;
  readonly angle: number;
}

/**
 * Becco d'uccello (taglio di appoggio): intaglio triangolare su tutta la
 * larghezza della faccia con vertice a profondità `depth` in `at`; `angle` è
 * l'inclinazione (gradi) della faccia di appoggio rispetto all'asse del pezzo
 * (tipicamente la pendenza del travetto); la seconda faccia è perpendicolare.
 */
export interface BeccoUccello extends MachiningBase {
  readonly type: "becco-uccello";
  readonly face: LateralFace;
  readonly depth: number;
  readonly angle: number;
}

/**
 * Foro cilindrico perpendicolare alla faccia, centro in (`at`, `offset`).
 * `depth` assente = passante.
 */
export interface Foro extends MachiningBase {
  readonly type: "foro";
  readonly face: LateralFace;
  readonly diameter: number;
  readonly offset: number;
  readonly depth?: number;
}

/**
 * Taglio di testa inclinato: piano passante per il punto (`at`, 0, 0) che
 * rimuove il materiale verso la testa indicata da `face`. `angle` è la
 * rotazione attorno a Y locale (inclinazione nel piano X–Z), `angle2` la
 * rotazione attorno a Z locale (secondo angolo, piano X–Y). 0° = taglio retto.
 */
export interface TaglioTesta extends MachiningBase {
  readonly type: "taglio-testa";
  readonly face: HeadFace;
  readonly angle: number;
  readonly angle2?: number;
}

/**
 * Asola per lama (E2): tasca rettangolare praticata dalla testa `face`, larga
 * `width` lungo Y locale, alta `height` lungo Z locale e profonda `depth` lungo
 * X verso l'interno del pezzo; centrata sulla sezione salvo lo scostamento
 * `offset` lungo Z (lame eccentriche). `at` coincide con la testa
 * (0 per `testa-inizio`, lunghezza per `testa-fine`), come per il tenone.
 */
export interface AsolaLama extends MachiningBase {
  readonly type: "asola-lama";
  readonly face: HeadFace;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly offset?: number;
}

export type Machining = MezzoLegno | Tenone | Mortasa | BeccoUccello | Foro | TaglioTesta | AsolaLama;

/** Lavorazione richiesta, senza `id`/`pieceId` (assegnati da `createMachining`). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type MachiningSpec = DistributiveOmit<Machining, "id" | "pieceId">;

/**
 * Asse curvo di un pezzo (E1): arco di cerchio nel piano locale X–Z che parte
 * dall'origine tangente a +X e curva verso +Z (centro di curvatura in
 * `(0, 0, radius)`). `sweep` è l'angolo sotteso in gradi; la lunghezza del
 * pezzo è lo sviluppo dell'asse `radius · sweep(rad)`. La sezione resta `b`
 * lungo Y e `h` radiale; `at` delle lavorazioni è la coordinata curvilinea.
 */
export interface Curve {
  readonly radius: number;
  readonly sweep: number;
}

export interface Piece {
  readonly id: string;
  readonly type: PieceType;
  readonly family: PieceFamily;
  readonly section: Section;
  readonly length: number;
  readonly pose: Pose;
  readonly label: string;
  readonly machinings: readonly Machining[];
  /** Asse curvo: presente solo (e sempre) per i tipi in `CURVED_PIECE_TYPES`. */
  readonly curve?: Curve;
}

export const JOINT_TYPES = ["tenone-mortasa", "mezzo-legno"] as const;
export type JointType = (typeof JOINT_TYPES)[number];

interface JointBase {
  readonly id: string;
  readonly pieceA: string;
  readonly pieceB: string;
}

/** Tenone sul pezzo A (testa più vicina a B), mortasa su B con `gap` su ogni dimensione. */
export interface TenoneMortasaJoint extends JointBase {
  readonly type: "tenone-mortasa";
  readonly params: {
    readonly width: number;
    readonly height: number;
    readonly length: number;
    readonly gap: number;
  };
}

/** Mezzo legno su entrambi i pezzi, profondo metà della rispettiva altezza. */
export interface MezzoLegnoJoint extends JointBase {
  readonly type: "mezzo-legno";
  readonly params: Readonly<Record<string, never>>;
}

export type Joint = TenoneMortasaJoint | MezzoLegnoJoint;

/** Valore di un parametro di tipologia (numeri in mm/gradi, sezioni come etichetta "b×h"). */
export type ParamValue = number | string | boolean;

/**
 * Assieme generato da una tipologia: pezzi posizionati, giunti (già espansi
 * nelle lavorazioni dei pezzi) e metadati. Definito qui perché la
 * serializzazione (`serialize.ts`) lo valida; `domain/assembly` lo riesporta.
 */
export interface Assembly {
  readonly typologySlug: string;
  readonly params: Readonly<Record<string, ParamValue>>;
  readonly pieces: readonly Piece[];
  readonly joints: readonly Joint[];
  readonly meta: Readonly<Record<string, ParamValue>>;
}
