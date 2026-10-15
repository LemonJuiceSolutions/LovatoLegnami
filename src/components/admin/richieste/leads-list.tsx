"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatEuro } from "@/domain/pricing/money"
import { LEAD_STATUS_LABELS, LEAD_STATUS_VALUES, type LeadRowView } from "./types"

/**
 * Elenco delle richieste (9.9): data, codice, cliente, tipologia, dimensioni, totale, stato,
 * assegnatario; filtro per stato, ricerca e paginazione nei parametri dell'indirizzo
 * (`?status=nuovo&q=…&page=2`), così il filtro si può condividere e ricaricare.
 */
export function LeadsList({
  items,
  total,
  page,
  pageSize,
  status,
  q,
  onNavigate,
}: {
  items: readonly LeadRowView[]
  total: number
  page: number
  pageSize: number
  status: string
  q: string
  /** Iniettabile nei test; default `router.push`. */
  onNavigate?: (href: string) => void
}) {
  const router = useRouter()
  const go = onNavigate ?? ((href: string) => router.push(href))
  const [query, setQuery] = React.useState(q)
  const href = (p: { status?: string; q?: string; page?: number }) => {
    const sp = new URLSearchParams()
    const s = p.status ?? status
    const text = p.q ?? q
    if (s) sp.set("status", s)
    if (text) sp.set("q", text)
    if (p.page && p.page > 1) sp.set("page", String(p.page))
    const qs = sp.toString()
    return `/admin/richieste${qs ? `?${qs}` : ""}`
  }
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="space-y-3">
      <form
        role="search"
        aria-label="Filtra le richieste"
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          go(href({ q: query.trim(), page: 1 }))
        }}
      >
        <label className="space-y-1 text-sm">
          <span className="block font-medium">Stato</span>
          <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={status} onChange={(e) => go(href({ status: e.target.value, page: 1 }))}>
            <option value="">tutti</option>
            {LEAD_STATUS_VALUES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block font-medium">Cerca</span>
          <Input type="search" className="h-9 w-64" placeholder="codice, nome o email" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <Button type="submit" variant="outline" size="sm">
          Cerca
        </Button>
        <span className="ml-auto text-sm text-muted-foreground">{total === 1 ? "1 richiesta" : `${total} richieste`}</span>
      </form>
      <div className="overflow-auto rounded-md border">
        <table className="w-full text-sm" aria-label="Richieste">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {["Data", "Codice", "Cliente", "Tipologia", "Dimensioni", "Totale", "Stato", "Assegnata a"].map((h) => (
                <th key={h} scope="col" className="px-2 py-1.5 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-2 py-4 text-center text-muted-foreground">
                  Nessuna richiesta
                </td>
              </tr>
            )}
            {items.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="whitespace-nowrap px-2 py-1.5">{l.createdAt}</td>
                <td className="px-2 py-1.5 font-mono">
                  <Link className="text-primary underline-offset-4 hover:underline" href={`/admin/richieste/${l.id}`}>
                    {l.code}
                  </Link>
                </td>
                <td className="px-2 py-1.5">{l.anonymized ? <span className="text-muted-foreground">anonimizzata</span> : l.customer}</td>
                <td className="px-2 py-1.5">{l.typology}</td>
                <td className="whitespace-nowrap px-2 py-1.5">{l.dimensions}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{l.totalCents === null ? "—" : formatEuro(l.totalCents)}</td>
                <td className="px-2 py-1.5">
                  <Badge variant={l.status === "nuovo" ? "default" : "secondary"}>{LEAD_STATUS_LABELS[l.status]}</Badge>
                </td>
                <td className="px-2 py-1.5">{l.assignee ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav aria-label="Pagine" className="flex items-center gap-2 text-sm">
          <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => go(href({ page: page - 1 }))}>
            Precedente
          </Button>
          <span>
            Pagina {page} di {pages}
          </span>
          <Button type="button" variant="outline" size="sm" disabled={page >= pages} onClick={() => go(href({ page: page + 1 }))}>
            Successiva
          </Button>
        </nav>
      )}
    </div>
  )
}
