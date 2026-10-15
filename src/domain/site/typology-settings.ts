import { z } from "zod";
import { ValidationError, formatPath } from "../components/errors";
import { defaultRegistry, type TypologyRegistry } from "../typologies/registry";

/**
 * Impostazioni delle tipologie sul sito pubblico (dataset `tipologie`, 6.5): per ogni
 * tipologia registrata visibilità, ordine, testi, immagini, preset di riferimento per
 * il prezzo "a partire da" e slug dell'URL (`/pergole/<seoSlug>`).
 *
 * La validazione verifica che ogni `slug` sia registrato e compaia una volta sola e
 * che i `seoSlug` siano unici. Il `referencePresetId` è controllato solo nella forma:
 * l'esistenza del preset è verificata alla pubblicazione (dataset `preset` separato).
 */

const kebab = (what: string) => z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, `${what} non valido (minuscole, cifre e trattini)`);

export const SiteImageSchema = z
  .object({
    /** URL assoluto o percorso servito dal sito (`/…`). */
    src: z.string().refine((v) => v.startsWith("/") || /^https:\/\//.test(v), "immagine: URL https o percorso che inizia con /"),
    alt: z.string().trim().min(1, "testo alternativo obbligatorio"),
  })
  .strict();
export type SiteImage = z.infer<typeof SiteImageSchema>;

export const TypologySettingSchema = z
  .object({
    slug: z.string().min(1),
    visible: z.boolean(),
    order: z.number().int().min(0),
    title: z.string().trim().min(1, "titolo obbligatorio").max(120),
    tagline: z.string().trim().max(200).default(""),
    description: z.string().trim().max(4000).default(""),
    heroImage: SiteImageSchema.optional(),
    gallery: z.array(SiteImageSchema).max(30).default([]),
    referencePresetId: kebab("preset di riferimento").optional(),
    seoSlug: kebab("slug SEO"),
  })
  .strict();

export type TypologySetting = z.infer<typeof TypologySettingSchema>;
export type TypologySettings = TypologySetting[];

/** Schema delle impostazioni contro un registro di tipologie. */
export function typologySettingsSchema(registry: TypologyRegistry = defaultRegistry) {
  return z.array(TypologySettingSchema).superRefine((items, ctx) => {
    const slugs = new Set<string>();
    const seo = new Set<string>();
    items.forEach((t, i) => {
      if (!registry.has(t.slug)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, "slug"], message: `tipologia non registrata: ${t.slug}` });
      if (slugs.has(t.slug)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, "slug"], message: `tipologia ripetuta: ${t.slug}` });
      slugs.add(t.slug);
      if (seo.has(t.seoSlug)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, "seoSlug"], message: `slug SEO duplicato: ${t.seoSlug}` });
      seo.add(t.seoSlug);
    });
  });
}

export const TypologySettingsSchema = typologySettingsSchema();

/** Valida le impostazioni; `ValidationError` con i percorsi (es. `[2].seoSlug`). */
export function parseTypologySettings(data: unknown, registry: TypologyRegistry = defaultRegistry): TypologySettings {
  const r = (registry === defaultRegistry ? TypologySettingsSchema : typologySettingsSchema(registry)).safeParse(data);
  if (!r.success)
    throw new ValidationError("impostazioni delle tipologie non valide", r.error.issues.map((i) => ({ path: formatPath(i.path), message: i.message })));
  return r.data;
}

/** Tipologie visibili sul sito all'avvio (MVP): le due con preventivo golden verificato. */
export const MVP_VISIBLE_TYPOLOGIES = ["addossata-monofalda", "autoportante-bifalda"] as const;

/**
 * Impostazioni iniziali (seed): tutte le tipologie registrate nell'ordine del registro,
 * titolo e descrizione dai template, visibili solo quelle indicate.
 */
export function defaultTypologySettings(
  registry: TypologyRegistry = defaultRegistry,
  visible: readonly string[] = MVP_VISIBLE_TYPOLOGIES,
): TypologySettings {
  return registry.list().map((t, i) => ({
    slug: t.slug,
    visible: visible.includes(t.slug),
    order: i,
    title: t.name,
    tagline: "",
    description: t.description,
    gallery: [],
    seoSlug: t.slug,
  }));
}
