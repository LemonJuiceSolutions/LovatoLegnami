"use client"

import * as React from "react"
import { Plus, Trash2 } from "lucide-react"
import { planDeviations } from "@/domain/envelope/plan"
import { getTypology } from "@/domain/typologies/registry"
import {
  OBSTACLE_FIELD_LABELS,
  OBSTACLE_INFO,
  OBSTACLE_KINDS,
  type AccessLevel,
  type DiagonalMeasures,
  type FloorDirection,
  type SimpleObstacle,
  type WallShape,
} from "./answers"
import { DiagonalsDrawing, FloorDrawing, ObstacleIcon } from "./illustrations"
import { ChoiceCards, CmInput, FieldError, Notice, Question, StepHeading } from "./ui"
import { useWizard, useWizardActions } from "./wizard-context"

/**
 * Passo 3 (12.4, spec "Spazio disponibile in termini semplici"): muro sì/no; muro dritto,
 * fuori squadra (con le due diagonali) o "non so"; pavimento in piano o in pendenza
 * (dislivello e verso); ostacoli guidati con pochi campi; accesso al cantiere. Le risposte
 * diventano l'ingombro del dominio in `toConfig`. In fondo il CAP del cantiere: chiesto qui,
 * prima del prezzo, perché la prima stima usi già la zona di trasporto giusta; è lo stesso
 * campo dei contatti (passo 6), che lo ritrova compilato.
 */
export function StepSpace() {
  const slug = useWizard((s) => s.answers.tipologia.slug)
  const space = useWizard((s) => s.answers.spazio)
  const misure = useWizard((s) => s.answers.misure)
  const plan = useWizard((s) => s.derived.plan)
  const planError = useWizard((s) => s.derived.planError)
  const cap = useWizard((s) => s.answers.contatti.cap)
  const { setSpace, setDiagonals, setContacts } = useWizardActions()
  const wallTypology = React.useMemo(() => (slug ? getTypology(slug).category === "addossata" : false), [slug])
  const wall = space.againstWall || wallTypology
  const deviation = plan ? Math.abs(planDeviations(plan).maxCornerDeg) : null

  const chooseShape = (shape: WallShape) => {
    setSpace({ wallShape: shape })
    // primo inserimento: lati proposti dalle misure della pergola
    if (shape === "diagonali" && space.diagonals.front === 0) {
      const w = misure.larghezza ?? misure.larghezzaA ?? 0
      const d = misure.profondita ?? 0
      setDiagonals({ front: w, back: w, left: d, right: d })
    }
  }

  return (
    <section aria-labelledby="passo-titolo">
      <StepHeading
        id="passo-titolo"
        eyebrow="Passo 3"
        title="Raccontaci lo spazio"
        intro="Poche domande su dove andrà la pergola. Se non sai qualcosa, va bene lo stesso: lo verifichiamo noi al sopralluogo."
      />

      {wallTypology ? (
        <Notice className="mb-10">Questo modello si appoggia a un muro di casa: le domande che seguono riguardano quel muro.</Notice>
      ) : (
        <Question title="È appoggiata a un muro?" hint="Per esempio contro la parete di casa o di un garage.">
          <ChoiceCards
            name="contromuro"
            value={space.againstWall ? "si" : "no"}
            onChange={(v) => setSpace({ againstWall: v === "si" })}
            options={[
              { value: "si", label: "Sì, vicino a un muro" },
              { value: "no", label: "No, è libera", description: "In mezzo al giardino o sul terrazzo." },
            ]}
            size="sm"
          />
        </Question>
      )}

      {wall && (
        <Question title="Il muro è dritto?" hint="Un muro “fuori squadra” non forma un angolo retto con i lati: succede spesso nelle case di qualche anno.">
          <ChoiceCards<WallShape>
            name="squadra"
            value={space.wallShape}
            onChange={chooseShape}
            columns={3}
            options={[
              { value: "dritto", label: "Sì, è dritto", description: "Gli angoli sembrano retti." },
              { value: "diagonali", label: "Non proprio", description: "Inserisco le misure: calcoliamo noi l'angolo." },
              { value: "nonso", label: "Non lo so", description: "Lo misuriamo noi al sopralluogo." },
            ]}
          />
          {space.wallShape === "diagonali" && (
            <DiagonalsForm
              diagonals={space.diagonals}
              onChange={setDiagonals}
              error={planError}
              deviation={deviation}
            />
          )}
        </Question>
      )}

      <Question title="Il pavimento è in piano?" hint="Se c'è una pendenza, i pilastri avranno altezze diverse.">
        <ChoiceCards
          name="pavimento"
          value={space.floor}
          onChange={(v) => setSpace({ floor: v })}
          options={[
            { value: "piano", label: "Sì, è in piano", visual: <FloorDrawing slope={false} className="h-10 w-20 text-foreground" /> },
            { value: "dislivello", label: "No, è in pendenza", visual: <FloorDrawing slope className="h-10 w-20 text-foreground" /> },
          ]}
        />
        {space.floor === "dislivello" && <FloorSlopeForm drop={space.floorDrop} direction={space.floorDirection} wall={wall} onChange={setSpace} />}
      </Question>

      {wall && <ObstaclesQuestion obstacles={space.obstacles} />}

      <Question title="Com'è l'accesso per il montaggio?" hint="Ci serve per organizzare il lavoro: più è difficile, più tempo ci vuole.">
        <ChoiceCards<AccessLevel>
          name="accesso"
          value={space.access}
          onChange={(v) => setSpace({ access: v })}
          columns={3}
          options={[
            { value: "facile", label: "Facile", description: "Si arriva con il furgone vicino al punto di montaggio." },
            { value: "medio", label: "Medio", description: "Qualche gradino o un passaggio stretto: si porta tutto a mano." },
            { value: "difficile", label: "Difficile", description: "Scale, piani alti o nessun accesso per i mezzi." },
          ]}
        />
      </Question>

      <CapQuestion value={cap} onChange={(v) => setContacts({ cap: v })} />
    </section>
  )
}

/** CAP a 5 cifre (lo stesso controllo del passo contatti). */
const isValidCap = (cap: string): boolean => /^\d{5}$/.test(cap.trim())

function CapQuestion({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = React.useId()
  const errorId = React.useId()
  const [touched, setTouched] = React.useState(false)
  const invalid = touched && value.trim() !== "" && !isValidCap(value)
  return (
    <Question title="Dove si trova il cantiere?" hint="Con il CAP calcoliamo subito il trasporto nel prezzo indicativo. Lo ritrovi già compilato nei contatti.">
      <div className="max-w-[12rem]">
        <label htmlFor={id} className="mb-1.5 block font-medium">
          CAP del cantiere
        </label>
        <input
          id={id}
          name="cap"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 5))}
          onBlur={() => setTouched(true)}
          autoComplete="postal-code"
          inputMode="numeric"
          maxLength={5}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid ? errorId : undefined}
          className={`h-12 w-full rounded-lg border-2 bg-background px-4 text-lg tabular-nums outline-none focus-visible:border-primary ${invalid ? "border-destructive" : "border-input"}`}
        />
      </div>
      {invalid && <FieldError id={errorId}>Il CAP ha 5 cifre.</FieldError>}
    </Question>
  )
}

const DIAGONAL_FIELDS: readonly { key: keyof DiagonalMeasures; n: number; label: string }[] = [
  { key: "front", n: 1, label: "Fronte (lato lontano dal muro)" },
  { key: "back", n: 2, label: "Lungo il muro" },
  { key: "left", n: 3, label: "Lato sinistro" },
  { key: "right", n: 4, label: "Lato destro" },
  { key: "d1", n: 5, label: "Diagonale: davanti a sinistra → muro a destra" },
  { key: "d2", n: 6, label: "Diagonale: davanti a destra → muro a sinistra" },
]

function DiagonalsForm({
  diagonals,
  onChange,
  error,
  deviation,
}: {
  diagonals: DiagonalMeasures
  onChange: (p: Partial<DiagonalMeasures>) => void
  error: string | null
  deviation: number | null
}) {
  const errorId = React.useId()
  const complete = Object.values(diagonals).every((v) => v > 0)
  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-5">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,280px)_1fr]">
        <DiagonalsDrawing className="mx-auto w-full max-w-[320px] text-foreground" />
        <div>
          <p className="font-semibold">Misura i quattro lati e le due diagonali</p>
          <p className="mt-1 text-muted-foreground">
            Con un metro, misura da un angolo vicino al muro all&apos;angolo opposto lontano dal muro, poi l&apos;altra diagonale. Se le due diagonali sono uguali il muro è in squadra.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {DIAGONAL_FIELDS.map((f) => (
              <DiagonalInput key={f.key} n={f.n} label={f.label} value={diagonals[f.key]} invalid={complete && !!error} errorId={errorId} onValue={(v) => onChange({ [f.key]: v })} />
            ))}
          </div>
        </div>
      </div>
      {complete && error && <FieldError id={errorId}>{error}</FieldError>}
      {complete && !error && deviation !== null && (
        <Notice className="mt-5" role="status">
          {deviation >= 0.5 ? (
            <>
              Il <strong>muro fuori squadra di circa {Math.round(deviation)}°</strong>: ne teniamo conto noi nel progetto e nel prezzo.
            </>
          ) : (
            <>Il muro risulta in squadra: perfetto.</>
          )}
        </Notice>
      )}
    </div>
  )
}

function DiagonalInput({ n, label, value, invalid, errorId, onValue }: { n: number; label: string; value: number; invalid: boolean; errorId: string; onValue: (v: number) => void }) {
  const id = React.useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-start gap-2 text-[0.98rem] font-medium leading-snug">
        <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {n}
        </span>
        {label}
      </label>
      <CmInput id={id} value={value} blankZero onValue={onValue} invalid={invalid} aria-describedby={invalid ? errorId : undefined} />
    </div>
  )
}

function FloorSlopeForm({
  drop,
  direction,
  wall,
  onChange,
}: {
  drop: number
  direction: FloorDirection
  wall: boolean
  onChange: (p: { floorDrop?: number; floorDirection?: FloorDirection }) => void
}) {
  const id = React.useId()
  const directions: { value: FloorDirection; label: string }[] = [
    { value: "fronte", label: wall ? "Verso il fronte (lontano dal muro)" : "Verso il davanti" },
    { value: "muro", label: wall ? "Verso il muro" : "Verso il retro" },
    { value: "sinistra", label: "Verso sinistra" },
    { value: "destra", label: "Verso destra" },
  ]
  return (
    <div className="mt-6 grid gap-6 rounded-xl border border-border bg-card p-5 sm:grid-cols-[12rem_1fr]">
      <div>
        <label htmlFor={id} className="mb-1.5 block font-medium">
          Dislivello
        </label>
        <CmInput id={id} value={drop} onValue={(v) => onChange({ floorDrop: Math.max(0, Math.min(100, v)) })} />
        <p className="mt-1.5 text-sm text-muted-foreground">Differenza tra il punto più alto e il più basso.</p>
      </div>
      <fieldset className="min-w-0">
        <legend className="mb-1.5 font-medium">Il pavimento scende…</legend>
        <ChoiceCards<FloorDirection> name="verso" value={direction} onChange={(v) => onChange({ floorDirection: v })} options={directions} size="sm" />
      </fieldset>
    </div>
  )
}

function ObstaclesQuestion({ obstacles }: { obstacles: readonly SimpleObstacle[] }) {
  const { addObstacle, removeObstacle, updateObstacle } = useWizardActions()
  const [focusId, setFocusId] = React.useState<string | null>(null)
  return (
    <Question title="C'è qualcosa sul muro o sopra?" hint="Grondaie, finestre, porte, tubi: ci aiutano a fare passare la pergola senza toccarli. Aggiungi solo quello che c'è.">
      {obstacles.length > 0 && (
        <ul className="mb-5 space-y-4" aria-label="Ostacoli inseriti">
          {obstacles.map((o) => (
            <li key={o.id}>
              <ObstacleCard obstacle={o} autoFocus={focusId === o.id} onChange={(p) => updateObstacle(o.id, p)} onRemove={() => removeObstacle(o.id)} />
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {OBSTACLE_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setFocusId(addObstacle(kind))}
            aria-label={`Aggiungi ${OBSTACLE_INFO[kind].label.toLowerCase()}`}
            className="flex min-h-14 items-center gap-3 rounded-xl border-2 border-dashed border-input bg-card px-4 text-left font-medium transition-colors hover:border-primary"
          >
            <ObstacleIcon kind={kind} className="h-8 w-8 shrink-0 text-[hsl(var(--site-wood))]" />
            <span className="flex-1">{OBSTACLE_INFO[kind].label}</span>
            <Plus className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </button>
        ))}
      </div>
    </Question>
  )
}

function ObstacleCard({ obstacle: o, autoFocus, onChange, onRemove }: { obstacle: SimpleObstacle; autoFocus: boolean; onChange: (p: Partial<SimpleObstacle>) => void; onRemove: () => void }) {
  const info = OBSTACLE_INFO[o.kind]
  const first = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (autoFocus) first.current?.focus()
  }, [autoFocus])
  const titleId = React.useId()
  return (
    <div className="rounded-xl border border-border bg-card p-5" role="group" aria-labelledby={titleId}>
      <div className="flex items-start gap-3">
        <ObstacleIcon kind={o.kind} className="h-10 w-10 shrink-0 text-[hsl(var(--site-wood))]" />
        <div className="min-w-0 flex-1">
          <p id={titleId} className="text-lg font-semibold">
            {info.label}
          </p>
          <p className="text-muted-foreground">{info.hint}</p>
        </div>
        <button type="button" onClick={onRemove} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border hover:border-destructive hover:text-destructive" aria-label={`Togli ${info.label.toLowerCase()}`}>
          <Trash2 className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {info.fields.map((f, i) => (
          <ObstacleField key={f} label={OBSTACLE_FIELD_LABELS[f]} value={o[f]} onValue={(v) => onChange({ [f]: Math.max(0, v) })} inputRef={i === 0 ? first : undefined} />
        ))}
      </div>
    </div>
  )
}

function ObstacleField({ label, value, onValue, inputRef }: { label: string; value: number; onValue: (v: number) => void; inputRef?: React.Ref<HTMLInputElement> }) {
  const id = React.useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-medium">
        {label}
      </label>
      <CmInput id={id} ref={inputRef} value={value} onValue={onValue} />
    </div>
  )
}
