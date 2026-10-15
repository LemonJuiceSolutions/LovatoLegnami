import { assemblyBounds, getTypology, planDeviations, type CustomerQuote } from "@/domain";
import { assemblyFromConfig, type AssemblyConfig } from "@/server/quotes/generate";
import { isometricDrawing, planDrawing, type VectorDrawing } from "./drawing";
import type { QuotePdfData } from "./quote-pdf";

/**
 * Dati del PDF dall'istantanea salvata: importi **solo** dalla vista cliente memorizzata
 * all'invio (riproducibili dopo un nuovo listino), misure e pianta dalla configurazione,
 * immagine della scena se presente, altrimenti assonometria rigenerata dalla configurazione.
 */
export interface QuotePdfSource {
  readonly code: string;
  readonly createdAt: Date;
  readonly kind: "indicativo" | "definitivo";
  readonly customer: QuotePdfData["customer"];
  readonly config: AssemblyConfig;
  readonly customerQuote: CustomerQuote;
  readonly customerNotes?: string | null;
  readonly image?: QuotePdfData["image"];
  /** Nome commerciale della tipologia (dataset tipologie); default il nome del template. */
  readonly typologyLabel?: string;
}

const metres = (mm: number) => `${(Math.round(mm / 10) / 100).toFixed(2).replace(".", ",")} m`;
const isoDate = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(d);

export function quotePdfData(src: QuotePdfSource): QuotePdfData {
  const { envelope } = src.config;
  let drawing: VectorDrawing | null = null;
  const measures: { label: string; value: string }[] = [];
  try {
    const assembly = assemblyFromConfig(src.config);
    const b = assemblyBounds(assembly);
    if (b) {
      measures.push(
        { label: "Larghezza", value: metres(b.max.x - b.min.x) },
        { label: "Profondità", value: metres(b.max.y - b.min.y) },
        { label: "Altezza massima", value: metres(b.max.z - Math.min(b.min.z, 0)) },
      );
    }
    if (!src.image) drawing = isometricDrawing(assembly.pieces);
  } catch {
    // tipologia o parametri non più generabili: il PDF resta valido senza disegno
  }
  measures.push({ label: "Spazio disponibile", value: `${metres(envelope.box.width)} × ${metres(envelope.box.depth)} × h ${metres(envelope.box.height)}` });
  let typology = src.typologyLabel;
  if (!typology) {
    try {
      typology = getTypology(src.config.typology).name;
    } catch {
      typology = src.config.typology;
    }
  }
  const plan = envelope.plan
    ? {
        drawing: planDrawing(envelope.plan.corners, envelope.box, envelope.wallSide),
        maxDeviationDeg: planDeviations(envelope.plan).maxCornerDeg,
      }
    : null;
  return {
    code: src.code,
    date: isoDate(src.createdAt),
    kind: src.kind,
    customer: src.customer,
    typology,
    measures,
    plan,
    image: src.image ?? null,
    drawing,
    quote: src.customerQuote,
    customerNotes: src.customerNotes ?? null,
  };
}
