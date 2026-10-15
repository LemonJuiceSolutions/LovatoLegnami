"use client"

import Link from "next/link"
import type { PriceList } from "@/domain/pricing/types"
import { cn } from "@/lib/utils"
import { PRICE_LIST_SECTIONS, type PriceListSectionSlug } from "../admin-nav"
import { DatasetEditorShell } from "../dataset-editor-shell"
import type { DatasetStatusInfo } from "../types"
import { PriceListEditor } from "./price-list-editor"

/** Pagina del listino (9.3): stato della versione, schede delle sezioni, form della sezione. */
export function ListinoPage({
  section,
  status,
  priceList,
  canCommercial,
  canTechnical,
}: {
  section: PriceListSectionSlug
  status: DatasetStatusInfo
  priceList: PriceList
  canCommercial: boolean
  canTechnical: boolean
}) {
  return (
    <DatasetEditorShell status={status} canPublish={canCommercial || canTechnical}>
      <nav aria-label="Sezioni del listino" className="flex flex-wrap gap-1">
        {PRICE_LIST_SECTIONS.map((s) => (
          <Link
            key={s.slug}
            href={`/admin/listino/${s.slug}`}
            aria-current={s.slug === section ? "page" : undefined}
            className={cn(
              "rounded-md border px-3 py-1 text-sm",
              s.slug === section ? "border-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-accent",
            )}
          >
            {s.label}
          </Link>
        ))}
      </nav>
      <PriceListEditor section={section} priceList={priceList} canCommercial={canCommercial} canTechnical={canTechnical} />
    </DatasetEditorShell>
  )
}
