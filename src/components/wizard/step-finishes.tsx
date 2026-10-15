"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { coveringText, hasTint, QUALITY_COPY, SPECIES_COPY, TINTS, TREATMENT_COPY } from "./finishes"
import { ChoiceCards, Question, StepHeading } from "./ui"
import { useWizard, useWizardActions, useWizardContext } from "./wizard-context"

/**
 * Passo 4 (12.5, spec "Copertura e finiture"): legno (specie e qualità), trattamento con
 * tinta a campioni, copertura con descrizione. Le voci sono quelle del listino attivo
 * (solo etichette e codici dal server): una voce assente dal listino non compare.
 */
export function StepFinishes() {
  const { data } = useWizardContext()
  const o = data.options
  const f = useWizard((s) => s.answers.finiture)
  const { setFinishes } = useWizardActions()
  const treatmentLabel = o.treatments.find((t) => t.id === f.treatment)?.label ?? ""

  return (
    <section aria-labelledby="passo-titolo">
      <StepHeading id="passo-titolo" eyebrow="Passo 4" title="Legno, colore e copertura" intro="Scegli come vuoi la tua pergola. Puoi cambiare idea anche dopo aver visto il prezzo." />

      <Question title="Che legno preferisci?">
        <ChoiceCards
          name="specie"
          value={f.species}
          onChange={(species) => setFinishes({ species })}
          columns={3}
          options={o.species.map((s) => ({
            value: s.id,
            label: s.label,
            description: SPECIES_COPY[s.id]?.text,
            visual: <Swatch color={SPECIES_COPY[s.id]?.swatch ?? "#C8A27A"} grain />,
          }))}
        />
      </Question>

      {o.qualities.length > 1 && (
        <Question title="Che tipo di trave?">
          <ChoiceCards
            name="qualita"
            value={f.quality}
            onChange={(quality) => setFinishes({ quality })}
            options={o.qualities.map((q) => ({ value: q.id, label: q.label.replace(/\s*\(.*\)$/, ""), description: QUALITY_COPY[q.id] }))}
          />
        </Question>
      )}

      <Question title="Come lo proteggiamo?" hint="All'esterno il legno va trattato: dura di più e si mantiene bello.">
        <ChoiceCards<string>
          name="trattamento"
          value={f.treatment ?? "nessuno"}
          onChange={(v) => setFinishes({ treatment: v === "nessuno" ? null : v, tint: hasTint(v === "nessuno" ? null : v) ? f.tint : null })}
          columns={2}
          options={[
            ...o.treatments.map((t) => ({ value: t.id, label: t.label, description: TREATMENT_COPY[t.id] })),
            { value: "nessuno", label: "Nessun trattamento", description: "Legno grezzo: lo tratti tu in un secondo momento." },
          ]}
        />
        {hasTint(f.treatment, treatmentLabel) && (
          <fieldset className="mt-6 min-w-0">
            <legend className="font-semibold">Tinta</legend>
            <p className="mt-1 text-muted-foreground">I colori sullo schermo sono indicativi: al sopralluogo ti mostriamo i campioni veri.</p>
            <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
              {TINTS.map((t) => (
                <label key={t.id} className="cursor-pointer text-center">
                  <input type="radio" name="tinta" value={t.id} checked={f.tint === t.id} onChange={() => setFinishes({ tint: t.id })} className="peer sr-only" />
                  <span
                    className="mx-auto block h-14 w-14 rounded-full border-2 border-border shadow-inner ring-offset-2 ring-offset-background peer-checked:ring-[3px] peer-checked:ring-primary peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-[hsl(var(--site-gold))]"
                    style={{ background: `linear-gradient(100deg, ${t.color}, ${t.color}dd 45%, ${t.color})` }}
                    aria-hidden="true"
                  />
                  <span className="mt-2 block text-[0.95rem]">{t.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </Question>

      <Question title="Vuoi una copertura?" hint="Senza copertura la pergola fa ombra ma non ripara dalla pioggia.">
        <ChoiceCards<string>
          name="copertura"
          value={f.covering ?? "nessuna"}
          onChange={(v) => setFinishes({ covering: v === "nessuna" ? null : v })}
          options={[
            { value: "nessuna", label: "Nessuna copertura", description: "Solo la struttura in legno: potrai aggiungerla in seguito." },
            ...o.coverings.map((c) => ({ value: c.id, label: c.label, description: coveringText(c.id, c.label) })),
          ]}
        />
      </Question>
    </section>
  )
}

function Swatch({ color, grain }: { color: string; grain?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn("block h-12 w-12 rounded-lg border border-black/10 shadow-inner")}
      style={{
        background: grain
          ? `repeating-linear-gradient(95deg, transparent 0 5px, rgba(0,0,0,0.08) 5px 6px, transparent 6px 13px), linear-gradient(90deg, ${color}, ${color}cc 50%, ${color})`
          : color,
      }}
    />
  )
}
