"use client"

import type { Preset } from "@/domain/presets/types"
import type { TypologySetting } from "@/domain/site/typology-settings"
import { DatasetEditorShell } from "../dataset-editor-shell"
import type { DatasetStatusInfo } from "../types"
import { PresetsEditor } from "./presets-editor"
import { TypologiesEditor, type PresetOption } from "./typologies-editor"

/** Pagina "Tipologie sul sito" (9.7). */
export function TipologiePage({
  status,
  settings,
  presets,
  startingPrices,
  canWrite,
}: {
  status: DatasetStatusInfo
  settings: readonly TypologySetting[]
  presets: readonly PresetOption[]
  startingPrices: Readonly<Record<string, string>>
  canWrite: boolean
}) {
  return (
    <DatasetEditorShell status={status} canPublish={canWrite}>
      <p className="text-sm text-muted-foreground">
        Una tipologia nascosta non compare nelle pagine pubbliche né nel preventivo online. Il prezzo «a partire da» è il totale cliente del preset di riferimento con il listino attivo.
      </p>
      <TypologiesEditor settings={settings} presets={presets} startingPrices={startingPrices} readOnly={!canWrite} />
    </DatasetEditorShell>
  )
}

/** Pagina "Preset" (9.7). */
export function PresetPage({ status, presets, typologyTitles, canWrite }: { status: DatasetStatusInfo; presets: readonly Preset[]; typologyTitles: Readonly<Record<string, string>>; canWrite: boolean }) {
  return (
    <DatasetEditorShell status={status} canPublish={canWrite}>
      <PresetsEditor presets={presets} typologyTitles={typologyTitles} readOnly={!canWrite} />
    </DatasetEditorShell>
  )
}
