import { assemblyBounds, generate, getTypology, parseEnvelope, resolveParams, type Envelope, type ParamValue, type Preset } from "@/domain";
import type { AssemblyConfig } from "@/server/quotes/generate";

/**
 * Configurazione di un preset del dataset `preset` (non del catalogo statico): parametri
 * risolti contro il template e ingombro del preset o, se assente, il contenitore
 * dell'assieme arrotondato ai 100 mm con 100 mm di margine (come i test del listino 4.9).
 */
export function presetAssemblyConfig(preset: Preset): AssemblyConfig {
  const params = resolveParams(getTypology(preset.typologySlug), preset.params) as Record<string, ParamValue>;
  return { typology: preset.typologySlug, params, envelope: preset.envelope ? parseEnvelope(preset.envelope) : containerOf(preset.typologySlug, params), embedment: 0 };
}

const up = (v: number) => Math.ceil(v / 100) * 100;

function containerOf(typology: string, params: Readonly<Record<string, ParamValue>>): Envelope {
  const b = assemblyBounds(generate(typology, params));
  if (!b) return parseEnvelope({ box: { width: 6000, depth: 4000, height: 3500 } });
  return parseEnvelope({ box: { width: up(b.max.x), depth: up(b.max.y) + 100, height: up(b.max.z) + 100 } });
}
