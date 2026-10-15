"use client"

import Link from "next/link"
import type { Preset } from "@/domain/presets/types"
import { SectionTable } from "../section-table"

/**
 * Preset (9.7): nome, descrizione e visibilità modificabili; tipologia e parametri in sola
 * lettura (sono configurazioni costruttive: si modificano nel configuratore), con
 * "Apri nel configuratore". Il documento salvato conserva tutti gli altri campi del preset.
 */

type PresetRow = { id: string; name: string; description?: string; visible: boolean; typologySlug: string; params?: string }

const paramsSummary = (p: Preset) =>
  Object.entries(p.params)
    .map(([k, v]) => `${k} ${typeof v === "number" ? String(v).replace(".", ",") : String(v)}`)
    .join(" · ")

export function PresetsEditor({ presets, readOnly = false, typologyTitles }: { presets: readonly Preset[]; readOnly?: boolean; typologyTitles: Readonly<Record<string, string>> }) {
  const byId = new Map(presets.map((p) => [p.id, p]))
  return (
    <SectionTable<PresetRow>
      label="Preset"
      description="Configurazioni pronte proposte nel configuratore e usate come riferimento per i prezzi «a partire da»."
      path=""
      readOnly={readOnly}
      searchable
      columns={[
        { key: "name", header: "Nome", kind: "text", width: "w-48" },
        { key: "description", header: "Descrizione", kind: "text", optional: true },
        { key: "visible", header: "Visibile", kind: "switch", width: "w-20" },
        { key: "typologySlug", header: "Tipologia", kind: "readonly", display: (r) => typologyTitles[r.typologySlug] ?? r.typologySlug },
        {
          key: "params",
          header: "Parametri",
          kind: "readonly",
          display: (r) => (byId.get(r.id) ? paramsSummary(byId.get(r.id)!) : ""),
          render: (r) => (
            <div className="space-y-1 py-1 text-xs">
              <p className="text-muted-foreground">{byId.get(r.id) ? paramsSummary(byId.get(r.id)!) || "parametri di default" : ""}</p>
              <Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/configuratore?preset=${encodeURIComponent(r.id)}`}>
                Apri nel configuratore
              </Link>
            </div>
          ),
        },
      ]}
      rows={presets.map((p) => ({ id: p.id, name: p.name, description: p.description, visible: p.visible !== false, typologySlug: p.typologySlug }))}
      toValue={(rows) =>
        rows.map((r) => {
          const original = byId.get(r.id)!
          const { description: _d, visible: _v, ...rest } = original
          void _d
          void _v
          return { ...rest, name: r.name, ...(r.description ? { description: r.description } : {}), ...(r.visible ? {} : { visible: false }) }
        })
      }
    />
  )
}
