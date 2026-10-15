import { z } from "zod";
import { ValidationError, formatPath } from "../components/errors";
import { PIECE_TYPES } from "../components/types";
import { EnvelopeSchema } from "../envelope/types";
import { defaultRegistry, type TypologyRegistry } from "../typologies/registry";
import { resolveParams } from "../typologies/template";
import type { Preset } from "./types";

/**
 * Schema del dataset `preset` (sito-preventivi 6.5): elenco di `Preset` modificabile
 * dall'ufficio. `tipologie-estese` fornisce il tipo e il catalogo ma non uno schema
 * di validazione: è definito qui. Oltre alla forma verifica che la tipologia sia
 * registrata, che i parametri siano accettati dal template (`resolveParams`) e che
 * gli id siano unici.
 */

const kebab = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id non valido (minuscole, cifre e trattini)");
const ParamValueSchema = z.union([z.number().finite(), z.string(), z.boolean()]);

export const PresetExpectedSchema = z
  .object({
    pieces: z.record(z.enum(PIECE_TYPES), z.number().int().min(0)),
    hardware: z.record(z.string().min(1), z.number().int().min(0)).optional(),
  })
  .strict();

export const PresetSchema = z
  .object({
    id: kebab,
    name: z.string().trim().min(1, "nome obbligatorio"),
    typologySlug: z.string().min(1),
    params: z.record(z.string().min(1), ParamValueSchema).default({}),
    envelope: EnvelopeSchema.optional(),
    source: z.string().default(""),
    notes: z.array(z.string()).default([]),
    expected: PresetExpectedSchema.optional(),
  })
  .strict();

/** Schema dell'elenco dei preset contro un registro di tipologie. */
export function presetsSchema(registry: TypologyRegistry = defaultRegistry) {
  return z.array(PresetSchema).superRefine((presets, ctx) => {
    const ids = new Set<string>();
    presets.forEach((p, i) => {
      if (ids.has(p.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, "id"], message: `id preset duplicato: ${p.id}` });
      ids.add(p.id);
      if (!registry.has(p.typologySlug)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, "typologySlug"], message: `tipologia non registrata: ${p.typologySlug}` });
        return;
      }
      try {
        resolveParams(registry.get(p.typologySlug), p.params);
      } catch (e) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, "params"], message: (e as Error).message });
      }
    });
  });
}

export const PresetsSchema = presetsSchema();

/** Valida l'elenco dei preset; `ValidationError` con i percorsi (es. `[3].typologySlug`). */
export function parsePresets(data: unknown, registry: TypologyRegistry = defaultRegistry): Preset[] {
  const r = (registry === defaultRegistry ? PresetsSchema : presetsSchema(registry)).safeParse(data);
  if (!r.success) throw new ValidationError("preset non validi", r.error.issues.map((i) => ({ path: formatPath(i.path), message: i.message })));
  return r.data as unknown as Preset[];
}
