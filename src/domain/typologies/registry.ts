import type { Assembly, ParamValue } from "../components/types";
import { parseSectionLabel } from "../components/sections";
import { isPieceType } from "../components/types";
import { BUILTIN_TEMPLATES } from "./templates";
import {
  type BuildOptions,
  TemplateError,
  buildAssembly,
  type ParamSpec,
  TYPOLOGY_CATEGORIES,
  type TypologyCategory,
  type TypologyTemplate,
} from "./template";

/** Slug non registrato. */
export class TypologyNotFoundError extends Error {
  readonly slug: string;

  constructor(slug: string) {
    super(`tipologia non trovata: "${slug}"`);
    this.name = "TypologyNotFoundError";
    this.slug = slug;
  }
}

/** Riepilogo di una tipologia per elenchi e UI. */
export interface TypologyInfo {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly category: TypologyCategory;
  readonly tags: readonly string[];
  readonly reference?: string;
  readonly params: readonly ParamSpec[];
}

function paramSpecProblems(params: readonly ParamSpec[]): string[] {
  const problems: string[] = [];
  const names = new Set<string>();
  for (const p of params) {
    if (!p.name) problems.push("parametro senza nome");
    if (names.has(p.name)) problems.push(`parametro duplicato: ${p.name}`);
    names.add(p.name);
    if (p.kind === "number") {
      if (!(p.min <= p.default && p.default <= p.max))
        problems.push(`parametro ${p.name}: default ${p.default} fuori da [${p.min}, ${p.max}]`);
      if (p.integer && ![p.min, p.max, p.default].every(Number.isInteger))
        problems.push(`parametro ${p.name}: limiti e default devono essere interi`);
    } else if (p.kind === "section") {
      if (!isPieceType(p.pieceType)) problems.push(`parametro ${p.name}: primitivo fuori catalogo ${JSON.stringify(p.pieceType)}`);
      if (!parseSectionLabel(p.default)) problems.push(`parametro ${p.name}: sezione di default non valida ${JSON.stringify(p.default)}`);
    } else if (p.kind === "enum") {
      const values = p.options.map((o) => o.value);
      if (values.length === 0) problems.push(`parametro ${p.name}: nessuna opzione`);
      if (new Set(values).size !== values.length) problems.push(`parametro ${p.name}: opzioni duplicate`);
      if (values.some((v) => typeof v !== "string" || !v)) problems.push(`parametro ${p.name}: valori delle opzioni non validi`);
      if (!values.includes(p.default))
        problems.push(`parametro ${p.name}: default ${JSON.stringify(p.default)} non tra le opzioni (${values.join(", ")})`);
    }
  }
  return problems;
}

/**
 * Verifica un template prima della registrazione: slug, parametri e una
 * costruzione di prova con i default (solo primitivi, lavorazioni e giunti
 * del catalogo; nessun errore di generazione).
 */
export function validateTemplate(template: TypologyTemplate): void {
  const slug = template.slug;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug ?? ""))
    throw new TemplateError(String(slug), "slug non valido (minuscole, cifre e trattini)");
  if (!template.name) throw new TemplateError(slug, "nome mancante");
  if (!(TYPOLOGY_CATEGORIES as readonly string[]).includes(template.category))
    throw new TemplateError(slug, `categoria non ammessa ${JSON.stringify(template.category)} (ammesse: ${TYPOLOGY_CATEGORIES.join(", ")})`);
  if (!Array.isArray(template.tags) || template.tags.some((t) => typeof t !== "string" || !t))
    throw new TemplateError(slug, "tag non validi (elenco di stringhe non vuote)");
  const paramProblems = paramSpecProblems(template.params);
  if (paramProblems.length) throw new TemplateError(slug, paramProblems.join("; "));
  try {
    // l'interprete rifiuta per primo primitivi/lavorazioni/giunti fuori catalogo
    buildAssembly(template);
  } catch (e) {
    if (e instanceof TemplateError) throw e;
    throw new TemplateError(slug, `generazione con i parametri di default fallita: ${(e as Error).message}`);
  }
}

/** Registro di tipologie indicizzato per slug (ordine di registrazione). */
export class TypologyRegistry {
  private readonly templates = new Map<string, TypologyTemplate>();

  constructor(templates: readonly TypologyTemplate[] = []) {
    templates.forEach((t) => this.register(t));
  }

  /** Registra un template dopo averlo validato; rifiuta slug già presenti. */
  register(template: TypologyTemplate): void {
    if (this.templates.has(template.slug)) throw new TemplateError(template.slug, "slug già registrato");
    validateTemplate(template);
    this.templates.set(template.slug, template);
  }

  has(slug: string): boolean {
    return this.templates.has(slug);
  }

  /** Template per slug; `TypologyNotFoundError` se assente. */
  get(slug: string): TypologyTemplate {
    const t = this.templates.get(slug);
    if (!t) throw new TypologyNotFoundError(slug);
    return t;
  }

  list(): TypologyInfo[] {
    return [...this.templates.values()].map(({ slug, name, description, category, tags, reference, params }) => ({
      slug,
      name,
      description,
      category,
      tags,
      ...(reference !== undefined ? { reference } : {}),
      params,
    }));
  }

  /** Genera l'assieme della tipologia con i parametri (default per quelli mancanti). */
  generate(
    slug: string,
    params: Readonly<Record<string, ParamValue | undefined>> = {},
    options: BuildOptions = {},
  ): Assembly {
    return buildAssembly(this.get(slug), params, options);
  }
}

export const createRegistry = (templates: readonly TypologyTemplate[] = []): TypologyRegistry =>
  new TypologyRegistry(templates);

/** Registro di default con le tipologie incluse nel prodotto. */
export const defaultRegistry: TypologyRegistry = createRegistry(BUILTIN_TEMPLATES);

export const registerTypology = (template: TypologyTemplate): void => defaultRegistry.register(template);
export const getTypology = (slug: string): TypologyTemplate => defaultRegistry.get(slug);
export const listTypologies = (): TypologyInfo[] => defaultRegistry.list();
export const generate = (
  slug: string,
  params: Readonly<Record<string, ParamValue | undefined>> = {},
  options: BuildOptions = {},
): Assembly => defaultRegistry.generate(slug, params, options);
