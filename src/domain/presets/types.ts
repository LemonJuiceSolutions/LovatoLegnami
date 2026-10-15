import type { ParamValue, PieceType } from "../components/types";
import type { Envelope, EnvelopeInput } from "../envelope/types";
import type { ResolvedParams } from "../typologies/template";

/**
 * Preset commerciale (spec `preset-commerciali`, E10): configurazione completa
 * (tipologia, parametri, ingombro facoltativo) tratta dal riferimento
 * `ricerca-chepergola.md`, con i conteggi attesi verificati dai test del catalogo.
 */

/** Conteggi attesi dell'assieme generato: pezzi per tipo, ferramenta per codice (quantità sommate). */
export interface PresetExpected {
  readonly pieces: Readonly<Partial<Record<PieceType, number>>>;
  readonly hardware?: Readonly<Record<string, number>>;
}

export interface Preset {
  /** Identificativo kebab-case (es. `maxi-5x5`). */
  readonly id: string;
  /** Nome commerciale mostrato nell'interfaccia (es. "MAXI 5×5"). */
  readonly name: string;
  readonly typologySlug: string;
  /** Parametri del preset; quelli omessi prendono il default della tipologia in `loadPreset`. */
  readonly params: Readonly<Record<string, ParamValue>>;
  /** Ingombro cliente facoltativo (input di `parseEnvelope`). */
  readonly envelope?: EnvelopeInput;
  /** Fonte: scheda della ricerca (es. `ricerca-chepergola.md §1 T-A, pergola-libera-4x6`). */
  readonly source: string;
  /**
   * Note: scelte dei parametri e scostamenti dal riferimento. Le voci che
   * derivano da una deduzione (non dichiarate dal sito) iniziano con `[dedotto]`.
   */
  readonly notes: readonly string[];
  readonly expected?: PresetExpected;
}

/** Preset caricato: tipologia, parametri risolti (completi) e ingombro validato. */
export interface LoadedPreset {
  readonly preset: Preset;
  readonly typologySlug: string;
  readonly params: ResolvedParams;
  readonly envelope?: Envelope;
}

/** Id di preset sconosciuto. */
export class PresetNotFoundError extends Error {
  readonly id: string;

  constructor(id: string) {
    super(`preset non trovato: "${id}"`);
    this.name = "PresetNotFoundError";
    this.id = id;
  }
}
