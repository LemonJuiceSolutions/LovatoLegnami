"use client"

import * as React from "react"
import { ArrowRight, Check } from "lucide-react"
import { TYPOLOGY_CATEGORIES, type TypologyCategory } from "@/domain/typologies/template"
import type { WizardTypology } from "@/server/site/wizard-data"
import { cn } from "@/lib/utils"
import { euro, footprint } from "./format"
import { StepHeading } from "./ui"

/** Etichette brevi dei filtri (stesse categorie del sito, spec "Scelta della tipologia"). */
export const CATEGORY_FILTER_LABELS: Readonly<Record<TypologyCategory, string>> = {
  addossata: "Addossate al muro",
  autoportante: "Libere in giardino",
  carport: "Carport",
  gazebo: "Gazebo",
  pensilina: "Pensiline",
}

type Filter = TypologyCategory | "tutte"

/**
 * Passo 1 (12.3): le tipologie visibili come schede con disegno (o foto dell'ufficio),
 * nome commerciale, descrizione breve e "a partire da", filtrabili per categoria. La
 * scelta applica il preset di riferimento e porta al passo delle misure.
 */
export function StepTypology({
  typologies,
  selected,
  onChoose,
}: {
  typologies: readonly WizardTypology[]
  selected: string | null
  onChoose: (t: WizardTypology) => void
}) {
  const [filter, setFilter] = React.useState<Filter>("tutte")
  const categories = TYPOLOGY_CATEGORIES.filter((c) => typologies.some((t) => t.category === c))
  const shown = filter === "tutte" ? typologies : typologies.filter((t) => t.category === filter)
  return (
    <section aria-labelledby="passo-titolo">
      <StepHeading
        id="passo-titolo"
        eyebrow="Il tuo preventivo in 6 passi"
        title="Che pergola hai in mente?"
        intro="Scegli il modello più vicino alla tua idea: partiamo dalle sue misure e le adattiamo al tuo spazio. Puoi cambiare tutto più avanti."
      />
      {categories.length > 1 && (
        <div role="group" aria-label="Filtra per tipo" className="-mx-1 mb-8 flex flex-wrap gap-2">
          {(["tutte", ...categories] as Filter[]).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={filter === c}
              onClick={() => setFilter(c)}
              className={cn(
                "min-h-11 rounded-full border-2 px-4 text-[0.98rem] font-medium transition-colors",
                filter === c ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-foreground/40",
              )}
            >
              {c === "tutte" ? "Tutti i modelli" : CATEGORY_FILTER_LABELS[c]}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <p className="text-muted-foreground">Nessun modello in questa categoria.</p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3" aria-label="Modelli disponibili">
          {shown.map((t) => (
            <li key={t.slug}>
              <TypologyChoice typology={t} selected={selected === t.slug} onChoose={() => onChoose(t)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function TypologyChoice({ typology: t, selected, onChoose }: { typology: WizardTypology; selected: boolean; onChoose: () => void }) {
  const titleId = React.useId()
  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-2xl border-2 bg-card transition-shadow",
        selected ? "border-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.12)]" : "border-border hover:shadow-md",
      )}
    >
      <div className="relative aspect-[4/3] border-b border-border/70">
        {t.heroImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- immagini dell'ufficio da /api/immagini, già ridimensionate
          <img src={t.heroImage.src} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="site-drafting site-drawing absolute inset-0 p-6 text-foreground" aria-hidden="true" dangerouslySetInnerHTML={{ __html: t.drawingSvg }} />
        )}
        {selected && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground">
            <Check className="h-4 w-4" aria-hidden="true" strokeWidth={3} /> Scelto
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-[0.95rem] text-muted-foreground">{t.categoryLabel}</p>
        <h2 id={titleId} className="site-display mt-1 text-[1.6rem] leading-tight">
          {t.title}
        </h2>
        {(t.tagline || t.description) && <p className="mt-2 line-clamp-3 text-foreground/80">{t.tagline || t.description}</p>}
        <p className="mt-4">
          {t.fromPrice ? (
            <>
              <span className="text-muted-foreground">a partire da </span>
              <strong className="site-display text-[1.45rem] font-medium text-[hsl(var(--site-gold-ink))]">{euro(t.fromPrice.totalCents)}</strong>
              <span className="block text-[0.92rem] text-muted-foreground">IVA inclusa, per {footprint(t.fromPrice.widthMm, t.fromPrice.depthMm)}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Prezzo su richiesta</span>
          )}
        </p>
        <div className="mt-auto pt-5">
          <button type="button" onClick={onChoose} aria-pressed={selected} className="site-btn site-btn-primary w-full">
            {selected ? "Continua con questo" : "Scegli questo modello"}
            <span className="sr-only">: {t.title}</span>
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  )
}
