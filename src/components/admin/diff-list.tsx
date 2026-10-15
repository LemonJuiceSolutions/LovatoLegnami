import type { DiffItem } from "./types"

/** Valore di una differenza in una riga: numeri e testi così come sono, oggetti in JSON compatto. */
export function showValue(v: unknown): string {
  if (v === undefined) return "—"
  if (typeof v === "string") return v === "" ? "«vuoto»" : v
  if (typeof v === "number" || typeof v === "boolean" || v === null) return String(v)
  const s = JSON.stringify(v)
  return s.length > 160 ? `${s.slice(0, 157)}…` : s
}

/** Elenco di differenze (campo, prima, dopo) per pubblicazione, import e registro. */
export function DiffList({ diff }: { diff: readonly DiffItem[] }) {
  if (!diff.length) return null
  return (
    <div className="max-h-72 overflow-auto rounded border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted">
          <tr>
            <th scope="col" className="px-2 py-1 text-left font-medium">
              Campo
            </th>
            <th scope="col" className="px-2 py-1 text-left font-medium">
              Prima
            </th>
            <th scope="col" className="px-2 py-1 text-left font-medium">
              Dopo
            </th>
          </tr>
        </thead>
        <tbody>
          {diff.map((d) => (
            <tr key={d.path} className="border-t align-top">
              <td className="px-2 py-1 font-mono">{d.path || "(documento)"}</td>
              <td className="px-2 py-1 text-muted-foreground line-through decoration-muted-foreground/40">{showValue(d.before)}</td>
              <td className="px-2 py-1">{showValue(d.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
