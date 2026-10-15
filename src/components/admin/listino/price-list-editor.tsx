"use client"

import * as React from "react"
import type { PriceList } from "@/domain/pricing/types"
import { FieldsForm, type FieldDef } from "../fields-form"
import type { Column } from "../editable-table"
import { SectionTable } from "../section-table"
import type { PriceListSectionSlug } from "../admin-nav"
import { ComplicationsForm } from "./complications-form"
import {
  bySection,
  FAMILY_OPTIONS,
  HARDWARE_KIND_OPTIONS,
  HARDWARE_OPTIONS,
  hardwareName,
  JOINT_OPTIONS,
  MACHINING_OPTIONS,
  MACHINING_UNIT_OPTIONS,
  PIECE_TYPE_OPTIONS,
  qualityOptions,
  sectionOptions,
  speciesOptions,
} from "./options"

/**
 * Form del listino per sezione (9.3): tabelle e parametri con unità, ognuno scrive una
 * porzione della bozza. Le parti dell'ufficio tecnico (lunghezze commerciali, sfrido
 * minimo, lama e rifili, lavorazioni) sono in sola lettura per il commerciale e viceversa;
 * il server ricontrolla comunque i permessi sulla differenza.
 */

export interface PriceListEditorProps {
  readonly section: PriceListSectionSlug
  readonly priceList: PriceList
  readonly canCommercial: boolean
  readonly canTechnical: boolean
  /** Pulsanti CSV per tabella (9.5). */
  readonly csvToolbar?: (table: CsvTableName) => React.ReactNode
}

export type CsvTableName = "legno" | "lunghezze" | "lavorazioni" | "ferramenta" | "trattamenti" | "coperture" | "manodopera" | "zone"

const unique =
  <R,>(key: (r: R) => string, what: string) =>
  (rows: readonly R[]): string | null => {
    const seen = new Set<string>()
    for (const r of rows) {
      const k = key(r)
      if (k && seen.has(k)) return `${what} "${k}" ripetuto: ogni voce deve comparire una volta`
      seen.add(k)
    }
    return null
  }

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const idCheck = (v: unknown) => (typeof v === "string" && !ID_RE.test(v) ? "solo minuscole, cifre e trattini (es. abete-rosso)" : null)

type Rec<T> = Readonly<Record<string, T>>
const entries = <T,>(rec: Rec<T> | undefined) => Object.entries(rec ?? {})
const sortedRecord = <T,>(pairs: [string, T][], cmp: (a: string, b: string) => number = (a, b) => a.localeCompare(b)) =>
  Object.fromEntries([...pairs].sort(([a], [b]) => cmp(a, b)))

// ---------------------------------------------------------------------------

type IdLabelRow = { id: string; label: string }
const idLabelColumns: Column<IdLabelRow>[] = [
  { key: "id", header: "Codice", kind: "text", validate: idCheck },
  { key: "label", header: "Nome", kind: "text" },
]

type M3Row = { species: string; quality: string; price: number }
type LengthRow = { section: string; length: number; price?: number; qualities?: string }
type SectionMmRow = { section: string; mm: number }
type SectionPriceRow = { section: string; price: number }
type PanelRow = { type: string; price: number }

function TimberSection({ pl, canCommercial, canTechnical, csvToolbar }: { pl: PriceList; canCommercial: boolean; canTechnical: boolean; csvToolbar?: PriceListEditorProps["csvToolbar"] }) {
  const sections = sectionOptions(pl)
  const t = pl.timber
  const m3Rows: M3Row[] = entries(t.pricePerM3).flatMap(([species, byQ]) => entries(byQ).map(([quality, price]) => ({ species, quality, price })))
  const lengthRows: LengthRow[] = entries(t.stockLengths)
    .sort(([a], [b]) => bySection(a, b))
    .flatMap(([section, ls]) => ls.map((l) => ({ section, length: l.length, price: l.priceCents, qualities: l.qualities?.join(" ") })))
  const qualityIds = new Set(t.qualities.map((q) => q.id))
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionTable<IdLabelRow> label="Specie" path="timber.species" readOnly={!canCommercial} columns={idLabelColumns} rows={t.species} newRow={() => ({ id: "", label: "" })} validateRows={unique((r) => r.id, "codice")} toValue={(rows) => rows} />
        <SectionTable<IdLabelRow> label="Qualità" path="timber.qualities" readOnly={!canCommercial} columns={idLabelColumns} rows={t.qualities} newRow={() => ({ id: "", label: "" })} validateRows={unique((r) => r.id, "codice")} toValue={(rows) => rows} />
      </div>
      <SectionTable<M3Row>
        label="Prezzi del legno al m³"
        description="Per specie e qualità; le combinazioni assenti danno «prezzo mancante» nel preventivo."
        path="timber.pricePerM3"
        readOnly={!canCommercial}
        toolbar={csvToolbar?.("legno")}
        columns={[
          { key: "species", header: "Specie", kind: "select", options: speciesOptions(pl) },
          { key: "quality", header: "Qualità", kind: "select", options: qualityOptions(pl) },
          { key: "price", header: "Prezzo", kind: "money", unit: "€/m³", min: 0 },
        ]}
        rows={m3Rows}
        newRow={() => ({ species: t.species[0]?.id ?? "", quality: t.qualities[0]?.id ?? "", price: 0 })}
        validateRows={unique((r) => `${r.species} ${r.quality}`, "combinazione")}
        toValue={(rows) => {
          const out = new Map<string, Map<string, number>>()
          for (const r of rows) {
            if (!out.has(r.species)) out.set(r.species, new Map())
            out.get(r.species)!.set(r.quality, r.price)
          }
          return Object.fromEntries([...out].map(([s, byQ]) => [s, Object.fromEntries(byQ)]))
        }}
      />
      <SectionTable<LengthRow>
        label="Lunghezze commerciali"
        description="Barre disponibili per sezione; il prezzo della barra, se indicato, prevale su €/ml e €/m³. Qualità separate da spazi (vuoto = tutte)."
        path="timber.stockLengths"
        readOnly={!canTechnical}
        toolbar={csvToolbar?.("lunghezze")}
        columns={[
          { key: "section", header: "Sezione", kind: "select", options: sections },
          { key: "length", header: "Lunghezza", kind: "number", unit: "mm", min: 1, integer: true },
          { key: "price", header: "Prezzo barra", kind: "money", unit: "€", min: 0, optional: true },
          {
            key: "qualities",
            header: "Solo qualità",
            kind: "text",
            optional: true,
            placeholder: "tutte",
            validate: (v) => {
              const bad = typeof v === "string" ? v.split(/\s+/).filter((q) => q && !qualityIds.has(q)) : []
              return bad.length ? `qualità sconosciuta: ${bad.join(", ")}` : null
            },
          },
        ]}
        rows={lengthRows}
        newRow={() => ({ section: sections[0]?.value ?? "", length: 6000 })}
        validateRows={unique((r) => `${r.section} ${r.length}`, "lunghezza")}
        toValue={(rows) => {
          const out = new Map<string, LengthRow[]>()
          for (const r of rows) out.set(r.section, [...(out.get(r.section) ?? []), r])
          return sortedRecord(
            [...out].map(([section, rs]) => [
              section,
              [...rs]
                .sort((a, b) => a.length - b.length)
                .map((r) => {
                  const qualities = r.qualities?.split(/\s+/).filter(Boolean) ?? []
                  return { length: r.length, ...(r.price !== undefined ? { priceCents: r.price } : {}), ...(qualities.length ? { qualities } : {}) }
                }),
            ]),
            bySection,
          )
        }}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionTable<SectionMmRow>
          label="Sfrido minimo riutilizzabile"
          description="Spezzoni da questa lunghezza in su sono riutilizzabili."
          path="timber.minReusableOffcut"
          readOnly={!canTechnical}
          columns={[
            { key: "section", header: "Sezione", kind: "select", options: sections },
            { key: "mm", header: "Spezzone minimo", kind: "number", unit: "mm", min: 0 },
          ]}
          rows={entries(t.minReusableOffcut).sort(([a], [b]) => bySection(a, b)).map(([section, mm]) => ({ section, mm }))}
          newRow={() => ({ section: sections[0]?.value ?? "", mm: 1000 })}
          validateRows={unique((r) => r.section, "sezione")}
          toValue={(rows) => sortedRecord(rows.map((r) => [r.section, r.mm]), bySection)}
        />
        <SectionTable<SectionPriceRow>
          label="Pezzi curvi al metro di sviluppo"
          path="timber.curvedPerMl"
          readOnly={!canCommercial}
          columns={[
            { key: "section", header: "Sezione", kind: "select", options: sections },
            { key: "price", header: "Prezzo", kind: "money", unit: "€/ml", min: 0 },
          ]}
          rows={entries(t.curvedPerMl).sort(([a], [b]) => bySection(a, b)).map(([section, price]) => ({ section, price }))}
          newRow={() => ({ section: sections[0]?.value ?? "", price: 0 })}
          validateRows={unique((r) => r.section, "sezione")}
          toValue={(rows) => sortedRecord(rows.map((r) => [r.section, r.price]), bySection)}
        />
        <SectionTable<SectionPriceRow>
          label="Prezzo al metro lineare (facoltativo)"
          description="Se presente per una sezione prevale sul prezzo al m³, per ogni specie."
          path="timber.pricePerMl"
          readOnly={!canCommercial}
          columns={[
            { key: "section", header: "Sezione", kind: "select", options: sections },
            { key: "price", header: "Prezzo", kind: "money", unit: "€/ml", min: 0 },
          ]}
          rows={entries(t.pricePerMl).map(([section, price]) => ({ section, price }))}
          newRow={() => ({ section: sections[0]?.value ?? "", price: 0 })}
          validateRows={unique((r) => r.section, "sezione")}
          toValue={(rows) => (rows.length ? sortedRecord(rows.map((r) => [r.section, r.price]), bySection) : null)}
        />
        <SectionTable<PanelRow>
          label="Pannelli al m²"
          path="timber.panelsPerM2"
          readOnly={!canCommercial}
          columns={[
            { key: "type", header: "Tipo di pezzo", kind: "select", options: PIECE_TYPE_OPTIONS },
            { key: "price", header: "Prezzo", kind: "money", unit: "€/m²", min: 0 },
          ]}
          rows={entries(t.panelsPerM2).map(([type, price]) => ({ type, price }))}
          newRow={() => ({ type: "grigliato", price: 0 })}
          validateRows={unique((r) => r.type, "tipo")}
          toValue={(rows) => Object.fromEntries(rows.map((r) => [r.type, r.price]))}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <FieldsForm
          title="Taglio"
          readOnly={!canTechnical}
          values={{ "timber.kerf": t.kerf, "timber.endTrim": t.endTrim }}
          fields={[
            { path: "timber.kerf", label: "Spessore lama", kind: "number", unit: "mm", min: 0, max: 50 },
            { path: "timber.endTrim", label: "Rifilo di testa", kind: "number", unit: "mm", min: 0, max: 500, help: "Perso a ognuna delle due estremità della barra" },
          ]}
        />
        <FieldsForm
          title="Curvi e recupero"
          readOnly={!canCommercial}
          values={{ "timber.curvedSetupCents": t.curvedSetupCents, "timber.offcutRecoveryPct": t.offcutRecoveryPct }}
          fields={[
            { path: "timber.curvedSetupCents", label: "Lavorazione per pezzo curvo", kind: "money", unit: "€", min: 0 },
            { path: "timber.offcutRecoveryPct", label: "Recupero degli spezzoni", kind: "number", unit: "%", min: 0, max: 100, help: "Quota del costo degli spezzoni riutilizzabili restituita al cliente" },
          ]}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

type RateRow = { type: string; baseMin: number; perUnitMin: number; unit: string }

function MachiningSection({ pl, canTechnical, csvToolbar }: { pl: PriceList; canTechnical: boolean; csvToolbar?: PriceListEditorProps["csvToolbar"] }) {
  const m = pl.machining
  return (
    <div className="space-y-4">
      <FieldsForm
        title="Centro di lavoro"
        readOnly={!canTechnical}
        values={{ "machining.hourlyRateCents": m.hourlyRateCents, "machining.handlingMinPerPiece": m.handlingMinPerPiece }}
        fields={[
          { path: "machining.hourlyRateCents", label: "Tariffa oraria CNC", kind: "money", unit: "€/h", min: 0 },
          { path: "machining.handlingMinPerPiece", label: "Movimentazione per pezzo", kind: "number", unit: "min", min: 0 },
        ]}
      />
      <SectionTable<RateRow>
        label="Tempi per tipo di lavorazione"
        description="Tempo = base + per unità × grandezza della lavorazione (mm, cm² o numero)."
        path="machining.perType"
        readOnly={!canTechnical}
        toolbar={csvToolbar?.("lavorazioni")}
        columns={[
          { key: "type", header: "Lavorazione", kind: "select", options: MACHINING_OPTIONS },
          { key: "baseMin", header: "Base", kind: "number", unit: "min", min: 0 },
          { key: "perUnitMin", header: "Per unità", kind: "number", unit: "min", min: 0 },
          { key: "unit", header: "Unità", kind: "select", options: MACHINING_UNIT_OPTIONS },
        ]}
        rows={entries(m.perType).map(([type, r]) => ({ type, ...r }))}
        newRow={() => ({ type: MACHINING_OPTIONS[0]!.value, baseMin: 0, perUnitMin: 0, unit: "n" })}
        validateRows={unique((r) => r.type, "lavorazione")}
        toValue={(rows) => Object.fromEntries(rows.map(({ type, ...r }) => [type, r]))}
      />
    </div>
  )
}

type HardwareRow = { code: string; name?: string; price: number }

function HardwareSection({ pl, canCommercial, csvToolbar }: { pl: PriceList; canCommercial: boolean; csvToolbar?: PriceListEditorProps["csvToolbar"] }) {
  return (
    <SectionTable<HardwareRow>
      label="Prezzi della ferramenta"
      description="Prezzo per pezzo, per codice di catalogo."
      path="hardware.priceCents"
      readOnly={!canCommercial}
      searchable
      toolbar={csvToolbar?.("ferramenta")}
      columns={[
        { key: "code", header: "Codice", kind: "select", options: HARDWARE_OPTIONS, width: "w-72" },
        { key: "name", header: "Descrizione", kind: "readonly", display: (r) => hardwareName(r.code) },
        { key: "price", header: "Prezzo", kind: "money", unit: "€/pz", min: 0 },
      ]}
      rows={entries(pl.hardware.priceCents)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([code, price]) => ({ code, price }))}
      newRow={() => ({ code: HARDWARE_OPTIONS[0]!.value, price: 0 })}
      validateRows={unique((r) => r.code, "codice")}
      toValue={(rows) => sortedRecord(rows.map((r) => [r.code, r.price]))}
    />
  )
}

type CatalogRow = { id: string; label: string; price: number }
const catalogColumns: Column<CatalogRow>[] = [
  { key: "id", header: "Codice", kind: "text", validate: idCheck },
  { key: "label", header: "Nome", kind: "text" },
  { key: "price", header: "Prezzo", kind: "money", unit: "€/m²", min: 0 },
]

function FinishesSection({ pl, canCommercial, csvToolbar }: { pl: PriceList; canCommercial: boolean; csvToolbar?: PriceListEditorProps["csvToolbar"] }) {
  const rows = (items: PriceList["treatments"]) => items.map((i) => ({ id: i.id, label: i.label, price: i.pricePerM2Cents }))
  const value = (rs: CatalogRow[]) => rs.map((r) => ({ id: r.id, label: r.label, pricePerM2Cents: r.price }))
  return (
    <div className="space-y-4">
      <SectionTable<CatalogRow> label="Trattamenti" description="Prezzo sulla superficie di tutti i pezzi." path="treatments" readOnly={!canCommercial} toolbar={csvToolbar?.("trattamenti")} columns={catalogColumns} rows={rows(pl.treatments)} newRow={() => ({ id: "", label: "", price: 0 })} validateRows={unique((r) => r.id, "codice")} toValue={value} />
      <SectionTable<CatalogRow> label="Coperture" description="Prezzo sulla superficie inclinata della copertura." path="coverings" readOnly={!canCommercial} toolbar={csvToolbar?.("coperture")} columns={catalogColumns} rows={rows(pl.coverings)} newRow={() => ({ id: "", label: "", price: 0 })} validateRows={unique((r) => r.id, "codice")} toValue={value} />
    </div>
  )
}

type MinRow = { key: string; min: number }

function LabourSection({ pl, canCommercial, csvToolbar }: { pl: PriceList; canCommercial: boolean; csvToolbar?: PriceListEditorProps["csvToolbar"] }) {
  const l = pl.labour
  const minTable = (label: string, path: string, header: string, options: typeof FAMILY_OPTIONS, rec: Rec<number>) => (
    <SectionTable<MinRow>
      label={label}
      path={path}
      readOnly={!canCommercial}
      columns={[
        { key: "key", header, kind: "select", options },
        { key: "min", header: "Tempo", kind: "number", unit: "min", min: 0 },
      ]}
      rows={entries(rec).map(([key, min]) => ({ key, min }))}
      newRow={() => ({ key: options[0]!.value, min: 0 })}
      validateRows={unique((r) => r.key, "voce")}
      toValue={(rows) => Object.fromEntries(rows.map((r) => [r.key, r.min]))}
    />
  )
  return (
    <div className="space-y-4">
      <FieldsForm
        title="Squadra e cantiere"
        readOnly={!canCommercial}
        values={{
          "labour.hourlyRateCents": l.hourlyRateCents,
          "labour.crewSize": l.crewSize,
          "labour.hoursPerDay": l.hoursPerDay,
          "labour.setupHours": l.setupHours,
          "labour.scaffoldHeightMm": l.scaffoldHeightMm,
          "labour.scaffoldCents": l.scaffoldCents,
        }}
        fields={[
          { path: "labour.hourlyRateCents", label: "Manodopera", kind: "money", unit: "€/h", min: 0, help: "Per ora-uomo" },
          { path: "labour.crewSize", label: "Persone in squadra", kind: "number", min: 1, max: 20, integer: true },
          { path: "labour.hoursPerDay", label: "Ore per giornata", kind: "number", unit: "h", min: 1, max: 24 },
          { path: "labour.setupHours", label: "Allestimento cantiere", kind: "number", unit: "h", min: 0 },
          { path: "labour.scaffoldHeightMm", label: "Ponteggio oltre", kind: "number", unit: "mm", min: 1 },
          { path: "labour.scaffoldCents", label: "Trabattello/ponteggio", kind: "money", unit: "€", min: 0 },
        ]}
      />
      {csvToolbar && <div className="flex justify-end">{csvToolbar("manodopera")}</div>}
      <div className="grid gap-4 lg:grid-cols-3">
        {minTable("Montaggio per pezzo", "labour.minPerPiece", "Famiglia", FAMILY_OPTIONS, l.minPerPiece)}
        {minTable("Montaggio per giunto", "labour.minPerJoint", "Giunto", JOINT_OPTIONS, l.minPerJoint)}
        {minTable("Montaggio per ferramenta", "labour.minPerHardware", "Ferramenta", HARDWARE_KIND_OPTIONS, l.minPerHardware)}
      </div>
    </div>
  )
}

type ZoneRow = { name: string; prefixes: string; km: number; price: number }

function TransportSection({ pl, canCommercial, csvToolbar }: { pl: PriceList; canCommercial: boolean; csvToolbar?: PriceListEditorProps["csvToolbar"] }) {
  const tr = pl.transport
  return (
    <div className="space-y-4">
      <SectionTable<ZoneRow>
        label="Zone di consegna per CAP"
        description="Prefissi di CAP separati da spazi (1–5 cifre); vince il prefisso più lungo. Prezzo per viaggio."
        path="transport.zones"
        readOnly={!canCommercial}
        toolbar={csvToolbar?.("zone")}
        columns={[
          { key: "name", header: "Zona", kind: "text" },
          {
            key: "prefixes",
            header: "Prefissi CAP",
            kind: "text",
            optional: true,
            validate: (v) => (typeof v === "string" && v.split(/\s+/).some((p) => p && !/^\d{1,5}$/.test(p)) ? "prefissi di 1–5 cifre separati da spazi" : null),
          },
          { key: "km", header: "Distanza", kind: "number", unit: "km", min: 0 },
          { key: "price", header: "Prezzo", kind: "money", unit: "€/viaggio", min: 0 },
        ]}
        rows={tr.zones.map((z) => ({ name: z.name, prefixes: z.capPrefixes.join(" "), km: z.km, price: z.priceCents }))}
        newRow={() => ({ name: "", prefixes: "", km: 0, price: 0 })}
        validateRows={unique((r) => r.name, "zona")}
        toValue={(rows) => rows.map((r) => ({ name: r.name, capPrefixes: (r.prefixes ?? "").split(/\s+/).filter(Boolean), km: r.km, priceCents: r.price }))}
      />
      <FieldsForm
        title="Ripiego e distanza manuale"
        readOnly={!canCommercial}
        values={{ "transport.fallbackZone": tr.fallbackZone, "transport.perKmCents": tr.perKmCents }}
        fields={[
          { path: "transport.fallbackZone", label: "Zona per CAP non trovati", kind: "select", options: tr.zones.map((z) => ({ value: z.name, label: z.name })) },
          { path: "transport.perKmCents", label: "Prezzo al km (distanza dell'ufficio)", kind: "money", unit: "€/km", min: 0, optional: true },
        ]}
      />
    </div>
  )
}

type VatRow = { id: string; label: string; pct: number }
type DiscountRow = { id: string; label: string; kind: string; value: number }

function MarginsSection({ pl, canCommercial }: { pl: PriceList; canCommercial: boolean }) {
  return (
    <div className="space-y-4">
      <FieldsForm
        title="Margini, minimo e arrotondamento"
        readOnly={!canCommercial}
        values={{
          "margins.materialsPct": pl.margins.materialsPct,
          "margins.labourPct": pl.margins.labourPct,
          minimumOrderCents: pl.minimumOrderCents,
          roundingStepCents: pl.roundingStepCents,
          indicativityPct: pl.indicativityPct,
          defaultVat: pl.defaultVat,
        }}
        fields={[
          { path: "margins.materialsPct", label: "Margine sui materiali", kind: "number", unit: "%", min: 0, max: 1000 },
          { path: "margins.labourPct", label: "Margine sulla manodopera", kind: "number", unit: "%", min: 0, max: 1000 },
          { path: "minimumOrderCents", label: "Minimo d'ordine", kind: "money", unit: "€", min: 0, help: "Imponibile minimo" },
          { path: "roundingStepCents", label: "Passo di arrotondamento", kind: "money", unit: "€", min: 0.01, help: "Totale IVA inclusa arrotondato a questo passo" },
          { path: "indicativityPct", label: "Fascia di indicatività", kind: "number", unit: "±%", min: 0, max: 100, help: "Mostrata al cliente come forchetta di prezzo" },
          { path: "defaultVat", label: "IVA di default", kind: "select", options: pl.vatRates.map((v) => ({ value: v.id, label: `${v.label} (${v.pct}%)` })) },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionTable<VatRow>
          label="Aliquote IVA"
          path="vatRates"
          readOnly={!canCommercial}
          columns={[
            { key: "id", header: "Codice", kind: "text", validate: idCheck },
            { key: "label", header: "Nome", kind: "text" },
            { key: "pct", header: "Aliquota", kind: "number", unit: "%", min: 0, max: 100 },
          ]}
          rows={pl.vatRates}
          newRow={() => ({ id: "", label: "", pct: 22 })}
          validateRows={unique((r) => r.id, "codice")}
          toValue={(rows) => rows}
        />
        <SectionTable<DiscountRow>
          label="Sconti di catalogo"
          description="Valore in % (percento) o in € (fisso)."
          path="discounts"
          readOnly={!canCommercial}
          columns={[
            { key: "id", header: "Codice", kind: "text", validate: idCheck },
            { key: "label", header: "Nome", kind: "text" },
            { key: "kind", header: "Tipo", kind: "select", options: [{ value: "percento", label: "percento" }, { value: "fisso", label: "fisso" }] },
            { key: "value", header: "Valore", kind: "number", unit: "% o €", min: 0, validate: (v, r) => (r.kind === "percento" && typeof v === "number" && v > 100 ? "lo sconto non può superare 100%" : null) },
          ]}
          rows={pl.discounts.map((d) => ({ ...d, value: d.kind === "fisso" ? d.value / 100 : d.value }))}
          newRow={() => ({ id: "", label: "", kind: "percento", value: 0 })}
          validateRows={unique((r) => r.id, "codice")}
          toValue={(rows) => rows.map((r) => ({ id: r.id, label: r.label, kind: r.kind, value: r.kind === "fisso" ? Math.round(r.value * 100) : r.value }))}
        />
      </div>
    </div>
  )
}

export function PriceListEditor({ section, priceList, canCommercial, canTechnical, csvToolbar }: PriceListEditorProps) {
  switch (section) {
    case "legno":
      return <TimberSection pl={priceList} canCommercial={canCommercial} canTechnical={canTechnical} csvToolbar={csvToolbar} />
    case "lavorazioni":
      return <MachiningSection pl={priceList} canTechnical={canTechnical} csvToolbar={csvToolbar} />
    case "ferramenta":
      return <HardwareSection pl={priceList} canCommercial={canCommercial} csvToolbar={csvToolbar} />
    case "finiture":
      return <FinishesSection pl={priceList} canCommercial={canCommercial} csvToolbar={csvToolbar} />
    case "montaggio":
      return <LabourSection pl={priceList} canCommercial={canCommercial} csvToolbar={csvToolbar} />
    case "complicazioni":
      return <ComplicationsForm rules={priceList.complications} readOnly={!canCommercial} />
    case "trasporto":
      return <TransportSection pl={priceList} canCommercial={canCommercial} csvToolbar={csvToolbar} />
    case "margini":
      return <MarginsSection pl={priceList} canCommercial={canCommercial} />
  }
}

export type { FieldDef }
