"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { formatEuro } from "@/domain/pricing/money"
import { SITE_FACTOR_LABELS, SITE_FACTOR_UNITS } from "@/domain/pricing/site-factors"
import { ACCESS_LEVELS, ANCHORING_KINDS, NUMERIC_SITE_FACTORS } from "@/domain/pricing/types"
import type { ActionResult } from "@/server/actions/result"
import type { SimulateInput } from "@/server/actions/simulate"
import type { Simulation, SimulationSide } from "@/server/actions/simulate"
import { parseCell } from "../cells"

/**
 * "Simula preventivo" (9.8): scelta di un preset o di una richiesta salvata, finiture e
 * CAP, fattori di cantiere modificabili (vuoto = calcolato), confronto affiancato tra
 * listino in bozza e attivo con vista ufficio completa, anteprima della vista cliente e
 * differenze riga per riga.
 */

export interface Option {
  readonly value: string
  readonly label: string
}

export type SimulateFn = (input: SimulateInput) => Promise<ActionResult<Simulation>>
const defaultSimulate: SimulateFn = async (input) => (await import("@/server/actions/simulate")).simulateQuote(input)

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
const euro = (c: number | null) => (c === null ? "—" : formatEuro(c))
const signed = (c: number) => `${c > 0 ? "+" : ""}${formatEuro(c)}`

export function Simulator({
  presets,
  leads,
  species,
  qualities,
  treatments,
  coverings,
  simulate = defaultSimulate,
}: {
  presets: readonly Option[]
  leads: readonly Option[]
  species: readonly Option[]
  qualities: readonly Option[]
  treatments: readonly Option[]
  coverings: readonly Option[]
  simulate?: SimulateFn
}) {
  const [kind, setKind] = React.useState<"preset" | "lead">("preset")
  const [sourceId, setSourceId] = React.useState(presets[0]?.value ?? "")
  const [opts, setOpts] = React.useState({ species: "", quality: "", treatment: "", covering: "", cap: "" })
  const [factorTexts, setFactorTexts] = React.useState<Record<string, string>>({})
  const [result, setResult] = React.useState<Simulation | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, start] = React.useTransition()

  const factorErrors = Object.fromEntries(
    NUMERIC_SITE_FACTORS.map((k) => [k, factorTexts[k] ? parseCell({ kind: "number", min: 0, optional: true }, factorTexts[k]!) : { ok: true as const, value: undefined }]).filter(([, r]) => !(r as { ok: boolean }).ok),
  )
  const capError = opts.cap && !/^\d{5}$/.test(opts.cap) ? "CAP di 5 cifre" : null

  const run = () => {
    if (!sourceId || Object.keys(factorErrors).length || capError) return
    const factors: Record<string, unknown> = {}
    for (const k of NUMERIC_SITE_FACTORS) {
      const r = factorTexts[k] ? parseCell({ kind: "number", min: 0 }, factorTexts[k]!) : null
      if (r?.ok) factors[k] = r.value
    }
    if (factorTexts.access) factors.access = factorTexts.access
    if (factorTexts.anchoring) factors.anchoring = factorTexts.anchoring
    const options = Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== ""))
    start(async () => {
      const r = await simulate({ source: { kind, id: sourceId }, factors: factors as SimulateInput["factors"], options })
      if (r.ok) {
        setResult(r.data)
        setError(null)
      } else setError(r.message)
    })
  }

  const sources = kind === "preset" ? presets : leads
  return (
    <div className="space-y-4">
      <form
        aria-label="Simula preventivo"
        className="space-y-3 rounded-md border p-3"
        onSubmit={(e) => {
          e.preventDefault()
          run()
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Configurazione</span>
            <select
              className={selectClass}
              value={kind}
              onChange={(e) => {
                const k = e.target.value as "preset" | "lead"
                setKind(k)
                setSourceId((k === "preset" ? presets : leads)[0]?.value ?? "")
              }}
            >
              <option value="preset">Preset</option>
              <option value="lead">Richiesta salvata</option>
            </select>
          </label>
          <label className="space-y-1 text-sm lg:col-span-2">
            <span className="font-medium">{kind === "preset" ? "Preset" : "Richiesta"}</span>
            <select className={selectClass} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              {sources.length === 0 && <option value="">— nessuna disponibile</option>}
              {sources.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">CAP di consegna</span>
            <Input inputMode="numeric" maxLength={5} value={opts.cap} aria-invalid={capError ? true : undefined} onChange={(e) => setOpts({ ...opts, cap: e.target.value.trim() })} placeholder="dalla richiesta" />
            {capError && (
              <span role="alert" className="text-xs text-destructive">
                {capError}
              </span>
            )}
          </label>
          {(
            [
              ["species", "Specie", species],
              ["quality", "Qualità", qualities],
              ["treatment", "Trattamento", treatments],
              ["covering", "Copertura", coverings],
            ] as const
          ).map(([key, label, options]) => (
            <label key={key} className="space-y-1 text-sm">
              <span className="font-medium">{label}</span>
              <select className={selectClass} value={opts[key]} onChange={(e) => setOpts({ ...opts, [key]: e.target.value })}>
                <option value="">{key === "species" || key === "quality" ? "predefinita" : kind === "lead" ? "dalla richiesta" : "nessuno"}</option>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Fattori di cantiere (vuoto = calcolato dalla configurazione)</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {NUMERIC_SITE_FACTORS.map((k) => (
              <label key={k} className="space-y-1 text-xs">
                <span>
                  {SITE_FACTOR_LABELS[k]}
                  {SITE_FACTOR_UNITS[k].trim() && ` (${SITE_FACTOR_UNITS[k].trim()})`}
                </span>
                <Input
                  inputMode="decimal"
                  className="h-8"
                  placeholder={result ? String(result.siteFactors[k]).replace(".", ",") : "calcolato"}
                  value={factorTexts[k] ?? ""}
                  aria-invalid={factorErrors[k] ? true : undefined}
                  onChange={(e) => setFactorTexts({ ...factorTexts, [k]: e.target.value })}
                />
                {factorErrors[k] && (
                  <span role="alert" className="text-destructive">
                    {(factorErrors[k] as { error: string }).error}
                  </span>
                )}
              </label>
            ))}
            {(
              [
                ["access", ACCESS_LEVELS],
                ["anchoring", ANCHORING_KINDS],
              ] as const
            ).map(([k, values]) => (
              <label key={k} className="space-y-1 text-xs">
                <span>{SITE_FACTOR_LABELS[k]}</span>
                <select className={cn(selectClass, "h-8")} value={factorTexts[k] ?? ""} onChange={(e) => setFactorTexts({ ...factorTexts, [k]: e.target.value })}>
                  <option value="">{k === "access" ? "dalla configurazione" : "calcolato"}</option>
                  {values.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={pending || !sourceId}>
            {pending ? "Calcolo…" : "Simula"}
          </Button>
          {error && (
            <span role="alert" className="text-sm text-destructive">
              {error}
            </span>
          )}
        </div>
      </form>
      {result && <SimulationResult sim={result} />}
    </div>
  )
}

function SimulationResult({ sim }: { sim: Simulation }) {
  return (
    <div className="space-y-4">
      <section aria-label="Totali" className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/40 p-3 text-sm">
        <span>
          Bozza: <strong>{sim.draft ? formatEuro(sim.draft.office.totals.totalCents) : "nessuna bozza"}</strong>
        </span>
        <span>
          Attiva: <strong>{sim.active ? formatEuro(sim.active.office.totals.totalCents) : "nessuna"}</strong>
        </span>
        {sim.totalDeltaCents !== null && (
          <span>
            Differenza: <strong className={sim.totalDeltaCents > 0 ? "text-destructive" : sim.totalDeltaCents < 0 ? "text-emerald-700 dark:text-emerald-400" : ""}>{signed(sim.totalDeltaCents)}</strong>
          </span>
        )}
      </section>
      {sim.draft && sim.active && (
        <section aria-label="Differenze per riga" className="space-y-1">
          <h3 className="text-sm font-semibold">{sim.lines.length ? "Differenze per riga" : "Nessuna differenza tra bozza e versione attiva"}</h3>
          {sim.lines.length > 0 && (
            <div className="overflow-auto rounded border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th scope="col" className="px-2 py-1 text-left font-medium">
                      Voce
                    </th>
                    <th scope="col" className="px-2 py-1 text-right font-medium">
                      Attiva
                    </th>
                    <th scope="col" className="px-2 py-1 text-right font-medium">
                      Bozza
                    </th>
                    <th scope="col" className="px-2 py-1 text-right font-medium">
                      Differenza
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sim.lines.map((l) => (
                    <tr key={l.code} className="border-t">
                      <td className="px-2 py-1">{l.label}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{euro(l.activeCents)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{euro(l.draftCents)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{signed(l.deltaCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        {sim.draft && <SideView title="Listino in bozza" side={sim.draft} />}
        {sim.active && <SideView title="Listino attivo" side={sim.active} />}
      </div>
    </div>
  )
}

function SideView({ title, side }: { title: string; side: SimulationSide }) {
  const o = side.office
  const c = side.customer
  return (
    <section aria-label={title} className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">{side.versionLabel}</span>
      </div>
      {o.status === "incompleto" && <p className="text-xs text-destructive">Preventivo incompleto: al cliente «prezzo su richiesta».</p>}
      <details open className="text-sm">
        <summary className="cursor-pointer font-medium">Vista ufficio</summary>
        <div className="mt-2 max-h-[50vh] overflow-auto rounded border">
          <table className="w-full text-xs">
            <tbody>
              {o.groups.map((g) => (
                <React.Fragment key={g.category}>
                  <tr className="bg-muted/60">
                    <th scope="rowgroup" colSpan={2} className="px-2 py-1 text-left font-medium">
                      {g.label}
                    </th>
                    <td className="px-2 py-1 text-right font-medium tabular-nums">{formatEuro(g.amountCents)}</td>
                  </tr>
                  {g.lines.map((l) => (
                    <tr key={l.code} className="border-t" title={l.explain.join("\n")}>
                      <td className="px-2 py-1">
                        {l.label}
                        {l.visibility === "ufficio" && <span className="ml-1 text-muted-foreground">(interna)</span>}
                      </td>
                      <td className="px-2 py-1 text-right text-muted-foreground tabular-nums">
                        {String(l.quantity).replace(".", ",")} {l.unit}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">{formatEuro(l.amountCents)}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 text-xs">
          <dt>Costi</dt>
          <dd className="text-right tabular-nums">{formatEuro(o.totals.costCents)}</dd>
          <dt>Margini</dt>
          <dd className="text-right tabular-nums">{formatEuro(o.totals.marginCents)}</dd>
          <dt>Imponibile</dt>
          <dd className="text-right tabular-nums">{formatEuro(o.totals.taxableCents)}</dd>
          <dt>IVA {o.totals.vatPct}%</dt>
          <dd className="text-right tabular-nums">{formatEuro(o.totals.vatCents)}</dd>
          <dt className="font-semibold">Totale</dt>
          <dd className="text-right font-semibold tabular-nums">{formatEuro(o.totals.totalCents)}</dd>
        </dl>
        {o.firedRules.length > 0 && (
          <p className="mt-2 text-xs">
            Complicazioni: {o.firedRules.map((r) => `${r.label} (${formatEuro(r.amountCents)})`).join(" · ")}
          </p>
        )}
        {o.warnings.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-xs text-amber-700 dark:text-amber-400">
            {o.warnings.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        )}
      </details>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Anteprima vista cliente</summary>
        <ul className="mt-2 space-y-1 text-xs">
          {c.groups.map((g) => (
            <li key={g.id} className="flex justify-between">
              <span>{g.label}</span>
              <span className="tabular-nums">{formatEuro(g.amountCents)}</span>
            </li>
          ))}
          <li className="flex justify-between font-semibold">
            <span>Totale IVA inclusa</span>
            <span className="tabular-nums">{c.status === "incompleto" ? "prezzo su richiesta" : formatEuro(c.totalCents)}</span>
          </li>
          <li className="text-muted-foreground">
            Fascia: {formatEuro(c.range.minCents)} – {formatEuro(c.range.maxCents)}
          </li>
          {c.notes.map((n) => (
            <li key={n} className="text-muted-foreground">
              {n}
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}
