"use client"

import * as React from "react"
import { getTypology } from "@/domain/typologies/registry"
import { measureFields } from "./answers"
import { cm } from "./format"
import { useWizard, useWizardContext } from "./wizard-context"

/**
 * Colonna "La tua pergola" accanto ai passi 2–4 e 6: modello e misure scelte (su
 * telefono scorre sotto il passo). Il riepilogo completo con 3D e prezzo è il passo 5.
 */
export function WizardAside() {
  const { data } = useWizardContext()
  const slug = useWizard((s) => s.answers.tipologia.slug)
  const misure = useWizard((s) => s.answers.misure)
  const typology = data.typologies.find((t) => t.slug === slug)
  const fields = React.useMemo(() => (slug ? measureFields(getTypology(slug)) : []), [slug])
  if (!typology) return null
  return (
    <aside aria-label="La tua pergola" className="lg:sticky lg:top-24 lg:self-start">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="site-drafting site-drawing aspect-[4/3] border-b border-border/70 p-6 text-foreground" aria-hidden="true" dangerouslySetInnerHTML={{ __html: typology.drawingSvg }} />
        <div className="p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[hsl(var(--site-gold-ink))]">La tua pergola</p>
          <p className="site-display mt-1 text-[1.5rem] leading-tight">{typology.title}</p>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[0.98rem]">
            {fields.map((f) => (
              <React.Fragment key={f.key}>
                <dt className="text-muted-foreground">{f.label}</dt>
                <dd className="text-right font-semibold tabular-nums">{misure[f.key] !== undefined ? cm(misure[f.key]!) : "—"}</dd>
              </React.Fragment>
            ))}
          </dl>
        </div>
      </div>
    </aside>
  )
}
