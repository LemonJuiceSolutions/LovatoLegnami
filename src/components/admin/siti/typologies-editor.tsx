"use client"

import * as React from "react"
import { ArrowDown, ArrowUp, ImagePlus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { formatPath } from "@/domain/components/errors"
import { TypologySettingsSchema, type SiteImage, type TypologySetting } from "@/domain/site/typology-settings"
import { useOptionalDraft } from "../draft-context"
import type { SaveOutcome } from "../editable-table"

/**
 * Tipologie sul sito (9.7): per ogni tipologia registrata visibilità, ordine, titolo
 * commerciale, sottotitolo, descrizione, immagine principale e galleria (caricate con
 * `POST /api/admin/immagini`, testo alternativo obbligatorio), preset di riferimento con il
 * prezzo "a partire da" calcolato con il listino attivo, slug dell'indirizzo. Salva il
 * documento intero dopo la validazione del dominio (slug SEO unici, …).
 */

export interface PresetOption {
  readonly id: string
  readonly name: string
  readonly typologySlug: string
}

export type UploadImageFn = (file: File) => Promise<{ ok: true; src: string } | { ok: false; message: string }>

const defaultUpload: UploadImageFn = async (file) => {
  const body = new FormData()
  body.set("file", file)
  try {
    const res = await fetch("/api/admin/immagini", { method: "POST", body })
    const json = (await res.json().catch(() => ({}))) as { src?: string; error?: string }
    return res.ok && json.src ? { ok: true, src: json.src } : { ok: false, message: json.error ?? "caricamento non riuscito" }
  } catch {
    return { ok: false, message: "caricamento non riuscito: controlla la connessione" }
  }
}

const textareaClass = "min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
const selectClass = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm"

export function TypologiesEditor({
  settings,
  presets,
  startingPrices,
  readOnly = false,
  onSave,
  upload = defaultUpload,
}: {
  settings: readonly TypologySetting[]
  presets: readonly PresetOption[]
  /** "a partire da 4.700,00 €" per id di preset (listino attivo). */
  startingPrices: Readonly<Record<string, string>>
  readOnly?: boolean
  onSave?: (settings: TypologySetting[]) => Promise<SaveOutcome>
  upload?: UploadImageFn
}) {
  const draft = useOptionalDraft()
  const save = onSave ?? ((s: TypologySetting[]) => (draft ? draft.save("", s) : Promise.resolve({ ok: false as const, message: "salvataggio non disponibile" })))
  const key = JSON.stringify(settings)
  const sorted = (xs: readonly TypologySetting[]) => [...xs].sort((a, b) => a.order - b.order)
  const [items, setItems] = React.useState(() => sorted(settings))
  const [dirty, setDirty] = React.useState(false)
  const [message, setMessage] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const [saving, start] = React.useTransition()
  const latest = React.useRef(settings)
  latest.current = settings
  React.useEffect(() => {
    if (!dirty) setItems(sorted(latest.current))
    // solo quando cambia il documento del server
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const change = (slug: string, patch: Partial<TypologySetting>) => {
    setItems((xs) => xs.map((x) => (x.slug === slug ? { ...x, ...patch } : x)))
    setDirty(true)
    setMessage(null)
  }
  const move = (index: number, delta: number) => {
    setItems((xs) => {
      const next = [...xs]
      const [it] = next.splice(index, 1)
      next.splice(index + delta, 0, it!)
      return next
    })
    setDirty(true)
  }

  // l'ordine sul sito è quello dell'elenco
  const value = items.map((t, i) => ({ ...t, order: i }))
  const parsed = TypologySettingsSchema.safeParse(value)
  const issues = parsed.success ? [] : parsed.error.issues.map((i) => ({ index: typeof i.path[0] === "number" ? i.path[0] : -1, text: `${formatPath(i.path.slice(1)) || "tipologia"}: ${i.message}` }))
  const canSave = !readOnly && dirty && parsed.success && !saving

  return (
    <div className="space-y-3">
      <ol className="space-y-3">
        {items.map((t, index) => (
          <TypologyCard
            key={t.slug}
            setting={t}
            index={index}
            count={items.length}
            presets={presets.filter((p) => p.typologySlug === t.slug)}
            startingPrices={startingPrices}
            errors={issues.filter((i) => i.index === index).map((i) => i.text)}
            readOnly={readOnly}
            upload={upload}
            onChange={(patch) => change(t.slug, patch)}
            onMove={(d) => move(index, d)}
          />
        ))}
      </ol>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!canSave}
            onClick={() =>
              parsed.success &&
              start(async () => {
                const out = await save(parsed.data)
                if (out.ok) setDirty(false)
                setMessage(out.ok ? { kind: "ok", text: "Salvato nella bozza" } : { kind: "error", text: out.message })
              })
            }
          >
            {saving ? "Salvataggio…" : "Salva nella bozza"}
          </Button>
          {issues.length > 0 && <span className="text-xs text-destructive">{issues.length === 1 ? "1 campo da correggere" : `${issues.length} campi da correggere`}</span>}
          {message && (
            <span role={message.kind === "error" ? "alert" : "status"} className={cn("text-xs", message.kind === "error" ? "text-destructive" : "text-muted-foreground")}>
              {message.text}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function TypologyCard({
  setting: t,
  index,
  count,
  presets,
  startingPrices,
  errors,
  readOnly,
  upload,
  onChange,
  onMove,
}: {
  setting: TypologySetting
  index: number
  count: number
  presets: readonly PresetOption[]
  startingPrices: Readonly<Record<string, string>>
  errors: readonly string[]
  readOnly: boolean
  upload: UploadImageFn
  onChange: (patch: Partial<TypologySetting>) => void
  onMove: (delta: number) => void
}) {
  const id = React.useId()
  const field = (name: string) => `${id}-${name}`
  const price = t.referencePresetId ? startingPrices[t.referencePresetId] : undefined
  return (
    <li className={cn("rounded-md border p-3", !t.visible && "bg-muted/40")}>
      <fieldset disabled={readOnly} className="space-y-3">
        <legend className="sr-only">Tipologia {t.slug}</legend>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">
            {index + 1}. {t.title} <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">{t.slug}</span>
          </p>
          <div className="flex items-center gap-1">
            <label className="mr-2 flex items-center gap-2 text-sm">
              <Switch checked={t.visible} aria-label={`Visibile sul sito: ${t.slug}`} onCheckedChange={(visible) => onChange({ visible })} />
              {t.visible ? "visibile sul sito" : "nascosta"}
            </label>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Sposta su ${t.slug}`} disabled={index === 0} onClick={() => onMove(-1)}>
              <ArrowUp className="h-4 w-4" aria-hidden />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Sposta giù ${t.slug}`} disabled={index === count - 1} onClick={() => onMove(1)}>
              <ArrowDown className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor={field("title")} className="text-sm font-medium">
              Titolo commerciale
            </label>
            <Input id={field("title")} maxLength={120} value={t.title} onChange={(e) => onChange({ title: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label htmlFor={field("tagline")} className="text-sm font-medium">
              Sottotitolo
            </label>
            <Input id={field("tagline")} maxLength={200} value={t.tagline} onChange={(e) => onChange({ tagline: e.target.value })} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label htmlFor={field("description")} className="text-sm font-medium">
              Descrizione
            </label>
            <textarea id={field("description")} className={textareaClass} maxLength={4000} value={t.description} onChange={(e) => onChange({ description: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label htmlFor={field("preset")} className="text-sm font-medium">
              Preset di riferimento
            </label>
            <select id={field("preset")} className={selectClass} value={t.referencePresetId ?? ""} onChange={(e) => onChange({ referencePresetId: e.target.value || undefined })}>
              <option value="">— nessuno (niente prezzo «a partire da»)</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {t.referencePresetId ? (price ?? "prezzo non calcolabile con il listino attivo (preventivo incompleto o preset non ancora pubblicato)") : "Nessun prezzo mostrato"}
            </p>
          </div>
          <div className="space-y-1">
            <label htmlFor={field("seo")} className="text-sm font-medium">
              Indirizzo della pagina
            </label>
            <div className="flex items-center gap-1 text-sm">
              <span className="text-muted-foreground">/pergole/</span>
              <Input id={field("seo")} className="font-mono" value={t.seoSlug} onChange={(e) => onChange({ seoSlug: e.target.value.trim().toLowerCase() })} />
            </div>
          </div>
        </div>
        <ImagesField
          label={`Immagine principale di ${t.slug}`}
          title="Immagine principale"
          images={t.heroImage ? [t.heroImage] : []}
          max={1}
          upload={upload}
          onChange={(imgs) => onChange({ heroImage: imgs[0] })}
        />
        <ImagesField label={`Galleria di ${t.slug}`} title="Galleria" images={t.gallery} max={30} upload={upload} onChange={(gallery) => onChange({ gallery })} />
        {errors.length > 0 && (
          <ul role="alert" className="list-disc pl-5 text-xs text-destructive">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </fieldset>
    </li>
  )
}

function ImagesField({
  label,
  title,
  images,
  max,
  upload,
  onChange,
}: {
  label: string
  title: string
  images: readonly SiteImage[]
  max: number
  upload: UploadImageFn
  onChange: (images: SiteImage[]) => void
}) {
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    const r = await upload(file)
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ""
    if (!r.ok) return setError(r.message)
    onChange([...images, { src: r.src, alt: "" }].slice(-max))
  }
  return (
    <div role="group" aria-label={label} className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{title}</span>
        {images.length < max || max === 1 ? (
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            <ImagePlus className="mr-1 h-4 w-4" aria-hidden />
            {busy ? "Caricamento…" : max === 1 && images.length ? "Sostituisci" : "Carica immagine"}
          </Button>
        ) : null}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-label={`File per ${label}`} onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {images.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {images.map((img, i) => (
            <li key={`${img.src}-${i}`} className="w-48 space-y-1 rounded border p-2">
              {/* immagini caricate dall'admin o percorsi del sito: anteprima semplice */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.src} alt={img.alt || "anteprima"} className="h-24 w-full rounded object-cover" />
              <Input
                aria-label={`Testo alternativo immagine ${i + 1} (${label})`}
                placeholder="Testo alternativo (obbligatorio)"
                className="h-8 text-xs"
                value={img.alt}
                onChange={(e) => onChange(images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))}
              />
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onChange(images.filter((_, j) => j !== i))}>
                <Trash2 className="mr-1 h-3 w-3" aria-hidden />
                Rimuovi
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
