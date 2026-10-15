import {
  customerView,
  GeometryError,
  HardwareError,
  JointError,
  MachiningError,
  ParamError,
  priceAssembly,
  TemplateError,
  ValidationError,
  type Quote,
} from "@/domain";
import type { ConfiguratoreConfig } from "@/stores/config";
import { ConfigFileError, parseConfigFile } from "@/stores/config-file";
import type { FieldIssue } from "@/server/http";
import { EstimateResponseSchema, type EstimateRequest, type EstimateResponse } from "@/server/public-dto";
import type { PublicCatalog } from "./catalog";
import { preparePublicAssembly, type PublicAssembly } from "./pipeline";

/**
 * Stima pubblica (P9): configurazione rivalidata, assieme rigenerato e adattato sul
 * server, prezzo con il listino attivo, **solo** vista cliente in uscita (validata con lo
 * schema strict della risposta prima di lasciare il server). Il preventivo completo
 * (vista ufficio) resta al chiamante per l'istantanea della richiesta (8.6).
 */

export class EstimateInputError extends Error {
  constructor(
    readonly issues: readonly FieldIssue[],
    /** 400 = dati non validi, 422 = validi ma non costruibili. */
    readonly status: 400 | 422 = 400,
  ) {
    super(issues.map((i) => `${i.path}: ${i.message}`).join("; "));
    this.name = "EstimateInputError";
  }
}

export interface EstimateResult {
  readonly response: EstimateResponse;
  readonly quote: Quote;
  /** Configurazione effettivamente prezzata (parametri dopo adattamento e dimensionamento). */
  readonly config: ConfiguratoreConfig;
  readonly prepared: PublicAssembly;
  readonly typologyTitle: string;
}

const DOMAIN_ERRORS = [GeometryError, HardwareError, JointError, MachiningError, ParamError, TemplateError, ValidationError] as const;

export function computeEstimate(input: EstimateRequest, catalog: PublicCatalog): EstimateResult {
  let config: ConfiguratoreConfig;
  try {
    config = parseConfigFile(input.config);
  } catch (e) {
    if (e instanceof ConfigFileError) throw new EstimateInputError(e.issues.map((i) => ({ path: `config.${i.path}`, message: i.message })));
    throw e;
  }
  const visible = catalog.typologies.get(config.typology);
  if (!visible) throw new EstimateInputError([{ path: "config.typology", message: "tipologia non disponibile per il preventivo online" }]);

  const { priceList } = catalog;
  const c = input.commercial;
  const issues: FieldIssue[] = [];
  if (!priceList.timber.species.some((s) => s.id === c.species)) issues.push({ path: "commercial.species", message: "specie non disponibile" });
  if (!priceList.timber.qualities.some((q) => q.id === c.quality)) issues.push({ path: "commercial.quality", message: "qualità non disponibile" });
  if (c.treatment && !priceList.treatments.some((t) => t.id === c.treatment)) issues.push({ path: "commercial.treatment", message: "trattamento non disponibile" });
  if (c.covering && !priceList.coverings.some((t) => t.id === c.covering)) issues.push({ path: "commercial.covering", message: "copertura non disponibile" });
  if (issues.length) throw new EstimateInputError(issues);

  let prepared: PublicAssembly;
  try {
    prepared = preparePublicAssembly(config, catalog.ruleSet);
  } catch (e) {
    // Parametri validi uno per uno ma incompatibili tra loro (es. sezioni manomesse): il
    // dettaglio del dominio resta sul server, al cliente un messaggio semplice.
    if (DOMAIN_ERRORS.some((E) => e instanceof E))
      throw new EstimateInputError([{ path: "config.params", message: "configurazione non realizzabile con questi parametri: modifica le misure o contattaci" }], 422);
    throw e;
  }
  const quote = priceAssembly({
    assembly: prepared.assembly,
    envelope: config.envelope,
    options: {
      species: c.species,
      quality: c.quality,
      treatment: c.treatment,
      covering: c.covering,
      access: input.declared.access,
      ...(input.declared.anchoring ? { anchoring: input.declared.anchoring } : {}),
      ...(input.declared.cap ? { cap: input.declared.cap } : {}),
    },
    priceList,
    version: catalog.priceListVersion,
    ruleSetVersion: catalog.ruleSetVersionId,
  });
  const response = EstimateResponseSchema.parse({ quote: customerView(quote), notes: [...prepared.notes] });
  return { response, quote, config: { ...config, params: prepared.config.params }, prepared, typologyTitle: visible.title };
}
